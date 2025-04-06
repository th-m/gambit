import { useParams } from "react-router";

export function meta({ params }: { params: { id: string, playerId: string } }) {
  return [
    { title: `Player ${params.playerId} - Game #${params.id}` },
    { name: "description", content: `Player ${params.playerId} details for game #${params.id}` },
  ];
}

export default function PlayerDetails() {
  const { id, playerId } = useParams();
  
  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold mb-6">Player {playerId}</h1>
      
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold mb-4">Player Details</h2>
        <div className="space-y-4">
          <div>
            <h3 className="font-medium">Role</h3>
            <p className="mt-1">Seer</p>
            <p className="text-sm text-gray-500 mt-1">Knows most evil players but must hide his identity.</p>
          </div>
          
          <div>
            <h3 className="font-medium">Team</h3>
            <p className="mt-1">Good</p>
          </div>
          
          <div className="mt-4">
            <h3 className="font-medium">Special Abilities</h3>
            <div className="mt-2 border border-gray-200 dark:border-gray-700 rounded p-4">
              <h4 className="font-medium">See Evil Players</h4>
              <p className="text-sm text-gray-500 mt-1">
                You can see all Evil players except the Infiltrator.
              </p>
            </div>
          </div>
        </div>
      </div>
      
      <div className="mt-6 bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold mb-4">Information</h2>
        <div className="space-y-4">
          <div>
            <h3 className="font-medium">Known Evil Players</h3>
            <ul className="mt-2 list-disc pl-5">
              <li>Player 3 - Unknown Type</li>
              <li>Player 5 - Unknown Type</li>
            </ul>
          </div>
        </div>
      </div>
      
      <div className="mt-6">
        <a href={`/games/${id}`} className="text-blue-500">
          ← Back to Game
        </a>
      </div>
    </div>
  );
} 