import { createClient } from '~/lib/supabase/server'
import { Button } from '~/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '~/components/ui/card'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import { 
  type ActionFunctionArgs, 
  type LoaderFunctionArgs,
  Link, 
  redirect, 
  useFetcher, 
  useSearchParams 
} from 'react-router'

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { supabase } = createClient(request)
  const { data: { session } } = await supabase.auth.getSession()

  // If user is already logged in, redirect them
  if (session) {
    const url = new URL(request.url)
    const redirectTo = url.searchParams.get('redirectTo') || '/'
    return redirect(redirectTo)
  }

  return {}
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const { supabase, headers } = createClient(request)
  const formData = await request.formData()
  const url = new URL(request.url)

  const email = formData.get('email') as string
  const password = formData.get('password') as string
  
  // Get the redirectTo parameter from the URL, defaulting to home if not present
  const redirectTo = url.searchParams.get('redirectTo') || '/'

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (error) {
    return {
      error: error instanceof Error ? error.message : 'An error occurred',
    }
  }

  // Redirect to the intended destination after successful login
  return redirect(redirectTo, { headers })
}

export default function Login() {
  const fetcher = useFetcher<typeof action>()
  const [searchParams] = useSearchParams()
  const redirectTo = searchParams.get('redirectTo')

  const error = fetcher.data?.error
  const loading = fetcher.state === 'submitting'

  return (
    <div className="flex min-h-svh w-full items-center justify-center bg-gray-900 p-6 md:p-10">
      <div className="w-full max-w-sm">
        <div className="flex flex-col gap-6">
          <Card className="border-gray-700 bg-gray-800 text-white">
            <CardHeader>
              <CardTitle className="text-2xl">Login</CardTitle>
              <CardDescription className="text-gray-300">Enter your email below to login to your account</CardDescription>
            </CardHeader>
            <CardContent>
              <fetcher.Form method="post">
                {/* Add a hidden field to preserve the redirectTo value in case the form is submitted */}
                {redirectTo && <input type="hidden" name="redirectTo" value={redirectTo} />}
                <div className="flex flex-col gap-6">
                  <div className="grid gap-2">
                    <Label htmlFor="email" className="text-gray-200">Email</Label>
                    <Input
                      id="email"
                      name="email"
                      type="email"
                      placeholder="m@example.com"
                      required
                      className="border-gray-600 bg-gray-700 text-white"
                    />
                  </div>
                  <div className="grid gap-2">
                    <div className="flex items-center">
                      <Label htmlFor="password" className="text-gray-200">Password</Label>
                      <Link
                        to="/forgot-password"
                        className="ml-auto inline-block text-sm text-blue-400 underline-offset-4 hover:underline"
                      >
                        Forgot your password?
                      </Link>
                    </div>
                    <Input 
                      id="password" 
                      type="password" 
                      name="password" 
                      required 
                      className="border-gray-600 bg-gray-700 text-white"
                    />
                  </div>
                  {error && <p className="text-sm text-red-500">{error}</p>}
                  <Button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-500" disabled={loading}>
                    {loading ? 'Logging in...' : 'Login'}
                  </Button>
                </div>
                <div className="mt-4 text-center text-sm text-gray-300">
                  Don&apos;t have an account?{' '}
                  <Link to="/sign-up" className="text-blue-400 underline-offset-4 hover:underline">
                    Sign up
                  </Link>
                </div>
              </fetcher.Form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
