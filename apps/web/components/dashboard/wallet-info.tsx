import { Smartphone, Wallet, FileText, Copy, Check, Loader2, AlertCircle, RefreshCw, QrCode, Send } from "lucide-react";
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious, CarouselApi } from "@repo/ui/components/ui/carousel";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@repo/ui/components/ui/tooltip";
import { useState, useEffect, useRef } from "react";
import { useWallet } from "@/hooks/useWallet";
import { walletStorage } from "@/lib/walletStorage";
import { useBrowserFingerprint } from "@/hooks/useBrowserFingerprint";

const WalletInfo = () => {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [carouselApi, setCarouselApi] = useState<CarouselApi>();
  const { wallets, loading, error, loadWallets, changeWallets } = useWallet();
  
  // Use browser fingerprint as unique user ID
  const { fingerprint, loading: fingerprintLoading, generateNewWallet } = useBrowserFingerprint();

  // Load wallets when fingerprint is ready
  useEffect(() => {
    if (fingerprint) {
      loadWallets(fingerprint);
    }
  }, [loadWallets, fingerprint]);

  // Set up carousel API
  useEffect(() => {
    if (!carouselApi) {
      return;
    }

    setCurrentSlide(carouselApi.selectedScrollSnap());

    carouselApi.on("select", () => {
      setCurrentSlide(carouselApi.selectedScrollSnap());
    });
  }, [carouselApi]);

  const actions = [
    { icon: RefreshCw, label: "Change", action: "change" },
    { icon: Copy, label: "Copy", action: "copy" },
    { icon: Send, label: "Send", action: "send" },
    { icon: QrCode, label: "Connect", action: "connect" },
  ];

  const truncateAddress = (address: string) => {
    if (address.length <= 15) return address;
    return `${address.slice(0, 7)}...${address.slice(-5)}`;
  };

  const handleActionClick = async (action: string) => {
    const currentWallet = wallets[currentSlide];
    
    if (action === 'change') {
      if (fingerprint) {
        // Generate new wallet ID (this updates state and triggers re-render)
        const newWalletId = generateNewWallet();
        
        // Load wallets for the new ID
        // The useEffect will automatically call loadWallets when fingerprint changes
        // So we don't need to do anything here - React handles it!
      }
    } else if (action === 'copy' && currentWallet) {
      await copyToClipboard(currentWallet.address, currentSlide);
    }
    // Add other action handlers as needed
  };

  const copyToClipboard = async (address: string, index: number) => {
    try {
      await navigator.clipboard.writeText(address);
      setCopiedIndex(currentSlide);
      setTimeout(() => setCopiedIndex(null), 2000);
    } catch (err) {
      console.error('Failed to copy: ', err);
    }
  };


  return (
    <div className="w-full max-w-2xl mx-auto">
      {/* Wallet Cards - Always show structure */}
      {(fingerprintLoading || loading || error || wallets.length > 0) && (
        <Carousel opts={{ loop: wallets.length > 1 }} className="w-full" setApi={setCarouselApi}>
          <CarouselContent>
            {(fingerprintLoading || loading || error) ? (
              // Show loading state in carousel structure
              <CarouselItem>
                <div className="rounded-t-3xl p-6 md:p-8 shadow-lg" style={{ backgroundImage: 'url("/04.-Purplies-Gradient-Texture-Background.jpg")', backgroundSize: 'cover', backgroundPosition: 'center' }}>
                  <div className="text-center space-y-1 md:space-y-0">
                    <p className="text-white text-sm md:text-base">
                      Wallet
                    </p>

                    {/* Loading Address */}
                    <div className="flex items-center justify-center gap-2">
                      <div className="rounded-lg px-4 py-2 flex items-center gap-2">
                        <Loader2 className="h-6 w-6 md:h-5 md:w-5 animate-spin text-white" />
                        <span className="text-white font-semibold text-3xl md:text-2xl">
                          {fingerprintLoading ? 'Initializing...' : 'Loading...'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </CarouselItem>
            ) : (
              // Show actual wallets
              wallets.map((wallet, index) => (
                <CarouselItem key={index}>
                  <div className="rounded-t-3xl p-6 md:p-8 shadow-lg" style={{ backgroundImage: 'url("/04.-Purplies-Gradient-Texture-Background.jpg")', backgroundSize: 'cover', backgroundPosition: 'center' }}>
                    <div className="text-center space-y-1 md:space-y-0">
                      <p className="text-white text-sm md:text-base">
                        {wallet.name}
                      </p>

                      {/* Wallet Address with Copy Button */}
                      <div className="flex items-center justify-center gap-2">
                        <div className="rounded-lg px-4 py-2 flex items-center gap-2">
                          <span className="text-white font-semibold text-3xl md:text-2xl">
                            {truncateAddress(wallet.address)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </CarouselItem>
              ))
            )}
          </CarouselContent>
          {!loading && !error && wallets.length > 1 && (
            <>
              <button 
                onClick={() => carouselApi?.scrollPrev()}
                className="absolute left-2 top-1/2 -translate-y-1/2 opacity-70 hover:opacity-100 transition-opacity z-10"
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M8 12L14 6V18L8 12Z" fill="white"/>
                </svg>
              </button>
              <button 
                onClick={() => carouselApi?.scrollNext()}
                className="absolute right-2 top-1/2 -translate-y-1/2 opacity-70 hover:opacity-100 transition-opacity z-10"
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M16 12L10 18V6L16 12Z" fill="white"/>
                </svg>
              </button>
            </>
          )}
        </Carousel>
      )}

      {/* Action Buttons */}
      <div className="rounded-b-3xl p-4 md:p-6 -mt-4 pt-8 md:pt-10" style={{ backgroundColor: '#292828' }}>
        <TooltipProvider>
          <div className="grid grid-cols-4 gap-2 md:gap-4">
            {actions.map((action) => (
              <Tooltip key={action.label} delayDuration={300}>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => handleActionClick(action.action)}
                    disabled={loading && action.action === 'change'}
                    className="flex flex-col items-center gap-2 group disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <div className="w-10 h-10 md:w-12 md:h-12 lg:w-14 lg:h-14 rounded-full border-2 border-gray-500/30 flex items-center justify-center group-hover:border-gray-500/50 transition-colors">
                      {loading && action.action === 'change' ? (
                        <Loader2 className="h-5 w-5 md:h-5 md:w-5 lg:h-6 lg:w-6 text-white animate-spin" />
                      ) : action.action === 'copy' && copiedIndex === currentSlide ? (
                        <Check className="h-6 w-6 md:h-5 md:w-5 lg:h-6 lg:w-6 text-white" />
                      ) : (
                        <action.icon className="h-6 w-6 md:h-5 md:w-5 lg:h-6 lg:w-6 text-white" />
                      )}
                    </div>
                    <span className="text-[11px] md:text-[11px] lg:text-xs font-medium text-white/50">
                      {loading && action.action === 'change' ? 'Changing...' : 
                       action.action === 'copy' && copiedIndex === currentSlide ? 'Copied!' : 
                       action.label}
                    </span>
                  </button>
                </TooltipTrigger>
                {(action.action === 'send' || action.action === 'connect') && (
                  <TooltipContent 
                    side="top" 
                    className="bg-black/20 backdrop-blur-sm text-white text-xs px-3 rounded-lg border border-white/20 max-w-xs"
                  >
                    <p>Coming Soon</p>
                  </TooltipContent>
                )}
              </Tooltip>
            ))}
          </div>
        </TooltipProvider>
      </div>

      {/* Additional Features Section */}
      <div className="rounded-t-3xl md:rounded-b-3xl pt-4 md:pt-6 pb-4 md:pb-6 mt-4 mb-2 -mx-4 md:mx-0" style={{ backgroundColor: '#292828' }}>
        <TooltipProvider>
          <div className="flex items-center justify-between mb-4 px-4 md:px-6">
            <h3 className="text-white text-sm md:text-base font-regular">Quick Actions</h3>
          </div>
          <div className="grid grid-cols-4 gap-2 md:gap-4 px-4 md:px-6">
            {actions.map((action) => (
              <Tooltip key={`quick-${action.label}`} delayDuration={300}>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => handleActionClick(action.action)}
                    disabled={loading && action.action === 'change'}
                    className="flex flex-col items-center gap-2 group disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <div className="w-10 h-10 md:w-12 md:h-12 lg:w-14 lg:h-14 rounded-full border-2 border-gray-500/30 flex items-center justify-center group-hover:border-gray-500/50 transition-colors">
                      {loading && action.action === 'change' ? (
                        <Loader2 className="h-5 w-5 md:h-5 md:w-5 lg:h-6 lg:w-6 text-white animate-spin" />
                      ) : action.action === 'copy' && copiedIndex === currentSlide ? (
                        <Check className="h-6 w-6 md:h-5 md:w-5 lg:h-6 lg:w-6 text-white" />
                      ) : (
                        <action.icon className="h-6 w-6 md:h-5 md:w-5 lg:h-6 lg:w-6 text-white" />
                      )}
                    </div>
                    <span className="text-[11px] md:text-[11px] lg:text-xs font-medium text-white/50">
                      {loading && action.action === 'change' ? 'Changing...' : 
                       action.action === 'copy' && copiedIndex === currentSlide ? 'Copied!' : 
                       action.label}
                    </span>
                  </button>
                </TooltipTrigger>
                {(action.action === 'send' || action.action === 'connect') && (
                  <TooltipContent 
                    side="top" 
                    className="bg-black/80 backdrop-blur-sm text-white text-xs px-3 py-2 rounded-lg border border-white/20 max-w-xs shadow-lg"
                  >
                    <p>Coming Soon</p>
                  </TooltipContent>
                )}
              </Tooltip>
            ))}
          </div>
        </TooltipProvider>
      </div>
    </div>
  );
};

export default WalletInfo;