import DashboardNavbar from "@/components/dashboard/navbar";

export default function TransactionsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {children}
      <DashboardNavbar />
    </>
  );
}
