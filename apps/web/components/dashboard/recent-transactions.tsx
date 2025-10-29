import Link from "next/link";

const RecentTransactions = () => {
  return (
    <div className="max-w-2xl mx-auto bg-white rounded-t-3xl -mt-4 md:mt-4 pt-4 md:pt-6 pb-20 border border-gray-200 shadow-sm overflow-y-auto max-h-[calc(100vh-350px)] -mx-5 md:mx-auto">
      {/* Top Divider */}
      <div className="flex justify-center mb-2 px-4 md:px-6">
        <div className="w-10 h-1 bg-gray-200 rounded-full"></div>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between mb-6 px-4 md:px-6">
        <h2 className="text-gray-900 text-lg md:text-2xl">
          Recent Transactions
        </h2>
        <Link href="/transactions" className="text-gray-500 text-sm md:text-base hover:opacity-70 transition-opacity">
          See all
        </Link>
      </div>

      {/* Waiting Text */}
      <div className="flex flex-col items-center justify-center py-16 md:py-20 px-4 md:px-6">
        {/* Empty Mailbox GIF */}
        <div className="-mt-32">
          <img
            src="/empty-mailbox-illustration-with-spiderweb-and-flie-2025-10-20-04-28-09-utc.gif"
            alt="Empty mailbox illustration"
            className="w-80 h-80 md:w-90 md:h-90 object-contain mix-blend-multiply"
          />
        </div>

        <p className="text-gray-600 text-lg md:text-xl font-medium z-10 -mt-16">
          Waiting...
        </p>
      </div>
    </div>
  );
};

export default RecentTransactions;