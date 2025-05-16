import rowdyCupLogo from "../assets/rowdy-cup-logo.svg";
import { useAuth } from "@/hooks/use-auth";

interface MainNavigationProps {
  isOpen: boolean;
  onNavigate: (path: string) => void;
}

const MainNavigation = ({ isOpen, onNavigate }: MainNavigationProps) => {
  const { isAuthenticated, logoutMutation } = useAuth();

  if (!isOpen) return null;

  return (
    <nav className="bg-white shadow-md">
      <div className="container mx-auto px-4 py-2">
        <div className="flex justify-center mb-4">
          <img src={rowdyCupLogo} alt="Rowdy Cup" className="h-16" />
        </div>

        <ul className="space-y-1">
          <li>
            <button 
              className="block w-full text-left py-2 hover:bg-gray-100 px-3 rounded font-semibold"
              onClick={() => onNavigate('/')}
            >
              Home
            </button>
          </li>

          <li>
            <button 
              className="block w-full text-left py-2 hover:bg-gray-100 px-3 rounded"
              onClick={() => onNavigate('/teams')}
            >
              Team Rosters
            </button>
          </li>

          <li>
            <button 
              className="block w-full text-left py-2 hover:bg-gray-100 px-3 rounded"
              onClick={() => onNavigate('/sportsbook')}
            >
              Sportsbook
            </button>
          </li>

          {!isAuthenticated ? (
            <li>
              <button 
                className="block w-full text-left py-2 mt-4 bg-gray-100 hover:bg-gray-200 px-3 rounded text-center"
                onClick={() => onNavigate('/auth')}
              >
                Login
              </button>
            </li>
          ) : (
            <li>
              <button 
                className="block w-full text-left py-2 mt-4 bg-gray-100 hover:bg-gray-200 px-3 rounded text-center text-rose-600"
                onClick={() => {
                  logoutMutation.mutate();
                  onNavigate('/');
                }}
              >
                Logout
              </button>
            </li>
          )}
        </ul>
      </div>
    </nav>
  );
};

export default MainNavigation;