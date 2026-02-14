// ============================================================================
// ServiceCard Component
// ============================================================================
// Individual service card with glassmorphism effect and three-sided border

import Image from "next/image";

interface ServiceCardProps {
  iconSrc: string;
  title: string;
  description: string;
}

const ServiceCard = ({ iconSrc, title, description }: ServiceCardProps) => {
  return (
    <div className="group relative flex flex-col items-center p-4 md:p-8 rounded-2xl backdrop-blur-xl transition-all duration-300 overflow-hidden border border-white/20 border-b-transparent">
      {/* Glassmorphism background with gradient */}
      <div className="absolute inset-0 bg-gradient-to-b from-white/[0.08] to-white/[0.02] rounded-2xl" />
      
      {/* Unified glowing border overlay */}
      <div className="absolute inset-0 rounded-2xl pointer-events-none">
        <div className="absolute inset-0 rounded-2xl bg-gradient-to-b from-white/10 via-white/5 to-transparent opacity-50" style={{ mask: 'linear-gradient(to bottom, white 0%, white 40%, transparent 100%)' }} />
      </div>
      
      {/* Card content */}
      <div className="relative z-10">
        {/* Icon container with custom image */}
        <div className="mb-6 flex h-16 w-16 md:h-20 md:w-20 items-center justify-center rounded-full bg-white/10 backdrop-blur-sm mx-auto overflow-hidden">
          <Image
            src={iconSrc}
            alt={title}
            width={48}
            height={48}
            className="h-10 w-10 md:h-12 md:w-12 object-contain"
          />
        </div>
        
        {/* Service title */}
        <h3 className="mb-4 text-lg md:text-xl font-semibold text-white text-center">
          {title}
        </h3>
        
        {/* Service description */}
        <p className="mb-4 md:mb-6 text-center text-sm text-slate-100/50 leading-relaxed">
          {description}
        </p>
        
        {/* Learn more button */}
        <button className="text-white hover:text-slate-300 transition-colors text-md font-normal mx-auto block">
          Learn More
        </button>
      </div>
    </div>
  );
};

// ============================================================================
// Services Section Component
// ============================================================================
// Main services section displaying three service cards in a grid layout

const Services = () => {
  // Services data array with custom image icons
  const services = [
    {
      iconSrc: "/Wallet.png",
      title: "Gas-less Burner Wallets",
      description: "Receive tokens instantly without gas fees in burner wallets for secure, private transactions.",
    },
    {
      iconSrc: "/Write-Cheque.png",
      title: "Secure Telegram Notifications",
      description: "Get private, real-time Telegram alerts for all wallet activities to stay informed and protected.",
    },
  ];

  return (
    <section className="bg-background pt-2 md:pt-20 pb-20 px-4">
      <div className="mx-auto mt-[2rem] max-w-7xl pl-0 pr-0">
        {/* Grid layout for service cards - responsive across breakpoints */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-12 md:gap-8 items-start">
          {services.map((service, index) => (
            // Middle card has negative margin top for staggered effect
            <div key={index} className={index === 1 ? "md:-mt-20" : ""}>
              <ServiceCard
                iconSrc={service.iconSrc}
                title={service.title}
                description={service.description}
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Services;
