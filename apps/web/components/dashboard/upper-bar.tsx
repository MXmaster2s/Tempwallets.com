import { Home, User } from "lucide-react";
import Link from "next/link";

const UpperBar = () => {
  return (
    <div className="lg:hidden fixed top-0 left-0 right-0 z-40 bg-gradient-to-b from-black/60 via-black/50 to-black/40 backdrop-blur-md">
      <div className="flex items-center justify-between px-4 pt-8">
        {/* Profile Circle - Left */}
        <div className="flex items-center justify-center w-10 h-10 rounded-full bg-gray-500/20 hover:bg-gray-500/30 transition-colors">
          <User className="h-5 w-5 text-white" />
        </div>

        {/* Text Content - Middle */}
        <div className="flex-1 text-center">
          <h1 className="text-white text-lg">Hello, User!</h1>
          <p className="text-gray-500 text-xs -mt-1 font-light">Welcome back</p>
        </div>

        {/* Home Icon - Right */}
        <Link href="/about" className="flex items-center justify-center w-10 h-10 rounded-full bg-gray-500/20 hover:bg-gray-500/30 transition-colors">
          <Home className="h-5 w-5 text-white" />
        </Link>
      </div>
    </div>
  );
};

export default UpperBar;