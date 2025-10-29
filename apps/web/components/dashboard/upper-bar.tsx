import { Bell, User } from "lucide-react";

const UpperBar = () => {
  return (
    <div className="lg:hidden fixed top-6 left-0 right-0 z-40 bg-black/40 backdrop-blur-md">
      <div className="flex items-center justify-between px-4 py-2">
        {/* Profile Circle - Left */}
        <div className="flex items-center justify-center w-10 h-10 rounded-full bg-gray-500/20 hover:bg-gray-500/30 transition-colors">
          <User className="h-5 w-5 text-white" />
        </div>

        {/* Text Content - Middle */}
        <div className="flex-1 text-center">
          <h1 className="text-white text-lg">Hello, User!</h1>
          <p className="text-gray-500 text-xs -mt-1 font-light">Welcome back</p>
        </div>

        {/* Notification Icon - Right */}
        <button className="flex items-center justify-center w-10 h-10 rounded-full bg-gray-500/20 hover:bg-gray-500/30 transition-colors">
          <Bell className="h-5 w-5 text-white" />
        </button>
      </div>
    </div>
  );
};

export default UpperBar;