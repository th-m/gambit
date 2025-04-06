import { useParams, Outlet } from "react-router";

export function meta({ params }: { params: { id: string } }) {
  return [
    { title: `Game #${params.id}` },
    { name: "description", content: `Game details for game #${params.id}` },
  ];
}

export default function GameDetails() {
  const { id } = useParams();
  
  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold mb-6">Game #{id}</h1>
      
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold mb-4">Players</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Player cards would go here */}
          <div className="border border-gray-200 dark:border-gray-700 rounded p-4">
            <h3 className="font-medium">Player 1</h3>
            <p className="text-sm text-gray-500">Role: Hidden</p>
            <a href={`/games/${id}/players/1`} className="text-blue-500 text-sm mt-2 inline-block">
              View Details
            </a>
          </div>
          <div className="border border-gray-200 dark:border-gray-700 rounded p-4">
            <h3 className="font-medium">Player 2</h3>
            <p className="text-sm text-gray-500">Role: Hidden</p>
            <a href={`/games/${id}/players/2`} className="text-blue-500 text-sm mt-2 inline-block">
              View Details
            </a>
          </div>
        </div>
      </div>
      
      <div className="mt-6 bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold mb-4">Game Status</h2>
        <div className="space-y-4">
          <div>
            <h3 className="font-medium">Current Round</h3>
            <p>1/5</p>
          </div>
          <div>
            <h3 className="font-medium">Quests</h3>
            <div className="flex space-x-2 mt-2">
              <span className="h-8 w-8 rounded-full bg-gray-200 flex items-center justify-center">?</span>
              <span className="h-8 w-8 rounded-full bg-gray-200 flex items-center justify-center">?</span>
              <span className="h-8 w-8 rounded-full bg-gray-200 flex items-center justify-center">?</span>
              <span className="h-8 w-8 rounded-full bg-gray-200 flex items-center justify-center">?</span>
              <span className="h-8 w-8 rounded-full bg-gray-200 flex items-center justify-center">?</span>
            </div>
          </div>
        </div>
      </div>
      <Outlet />
      <div className="mt-6">
        <a href="/" className="text-blue-500">
          ← Back to Home
        </a>
      </div>
    </div>
  );
} 