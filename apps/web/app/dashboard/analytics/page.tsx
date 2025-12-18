import { ComingSoonSection } from "@/components/dashboard/ui/coming-soon";

const analyticsHighlights = [
  "Cross-chain performance snapshots",
  "Gas and fee optimization tips",
  "Automated compliance-ready exports",
];

export default function AnalyticsPage() {
  return (
    <ComingSoonSection
      title="Analytics insights"
      description="You'll soon be able to track wallet health, yield, and spending trends in one interactive view."
      highlights={analyticsHighlights}
    />
  );
}
