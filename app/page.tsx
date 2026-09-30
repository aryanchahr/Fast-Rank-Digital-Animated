"use client";

import { useState, useEffect, useRef } from "react";

const TOTAL_FRAMES = 150;
const padIndex = (n: number) => String(n).padStart(3, "0");
const getFramePath = (n: number) => `/frames/frame_${padIndex(n)}.jpg`;

function ScrollCanvas({
  containerRef,
}: {
  containerRef: React.RefObject<HTMLDivElement | null>;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imagesRef = useRef<(HTMLImageElement | null)[]>(new Array(TOTAL_FRAMES + 1).fill(null));
  const isLoadedRef = useRef<boolean[]>(new Array(TOTAL_FRAMES + 1).fill(false));
  const targetFrameRef = useRef<number>(1);
  const currentFrameRef = useRef<number>(1);
  const isReducedMotionRef = useRef<boolean>(false);

  // Helper: Find closest loaded frame to target index
  const getLoadedImage = (targetIndex: number): HTMLImageElement | null => {
    const target = Math.min(Math.max(Math.round(targetIndex), 1), TOTAL_FRAMES);

    // 1. Exact frame match
    if (isLoadedRef.current[target] && imagesRef.current[target]) {
      return imagesRef.current[target];
    }

    // 2. Search outwards for the closest loaded frame
    for (let offset = 1; offset <= TOTAL_FRAMES; offset++) {
      const prev = target - offset;
      if (prev >= 1 && isLoadedRef.current[prev] && imagesRef.current[prev]) {
        return imagesRef.current[prev];
      }
      const next = target + offset;
      if (next <= TOTAL_FRAMES && isLoadedRef.current[next] && imagesRef.current[next]) {
        return imagesRef.current[next];
      }
    }

    return null;
  };

  // Draw frame to canvas with aspect cover math
  const draw = (frameIndex: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const img = getLoadedImage(frameIndex);
    if (!img || !img.complete || img.naturalWidth === 0) return;

    const cw = canvas.width;
    const ch = canvas.height;
    const iw = img.naturalWidth;
    const ih = img.naturalHeight;

    const scale = Math.max(cw / iw, ch / ih);
    const dw = iw * scale;
    const dh = ih * scale;
    const dx = (cw - dw) / 2;
    const dy = (ch - dh) / 2;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.clearRect(0, 0, cw, ch);
    ctx.drawImage(img, dx, dy, dw, dh);
  };

  // Preloading Strategy
  useEffect(() => {
    // Check prefers-reduced-motion
    if (typeof window !== "undefined") {
      const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
      isReducedMotionRef.current = mediaQuery.matches;
      const motionListener = (e: MediaQueryListEvent) => {
        isReducedMotionRef.current = e.matches;
      };
      mediaQuery.addEventListener("change", motionListener);
    }

    const loadFrame = (index: number, onComplete?: () => void) => {
      if (isLoadedRef.current[index] && imagesRef.current[index]) return;

      const img = new Image();
      img.onload = () => {
        imagesRef.current[index] = img;
        isLoadedRef.current[index] = true;
        if (onComplete) onComplete();
      };
      img.onerror = () => {
        // Fallback to png if jpg fails
        if (!img.src.endsWith(".png")) {
          img.src = `/frames/frame_${padIndex(index)}.png`;
        }
      };
      img.src = getFramePath(index);
    };

    // 1. Immediately load frame 1 and draw it
    loadFrame(1, () => {
      draw(1);
    });

    // 2. Preload first 10 frames for instant smooth start
    for (let i = 2; i <= 10; i++) {
      loadFrame(i);
    }

    // 3. Preload keyframes across the sequence (every 5th frame)
    for (let k = 15; k <= TOTAL_FRAMES; k += 5) {
      loadFrame(k);
    }

    // 4. Progressively stream all remaining frames
    let frameToLoad = 11;
    let timer: NodeJS.Timeout;

    const loadRemaining = () => {
      let count = 0;
      while (frameToLoad <= TOTAL_FRAMES && count < 6) {
        if (!isLoadedRef.current[frameToLoad]) {
          loadFrame(frameToLoad);
          count++;
        }
        frameToLoad++;
      }
      if (frameToLoad <= TOTAL_FRAMES) {
        timer = setTimeout(loadRemaining, 30);
      }
    };

    timer = setTimeout(loadRemaining, 50);

    return () => {
      clearTimeout(timer);
    };
  }, []);

  // Resize and DPR listener
  useEffect(() => {
    const handleResize = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(window.innerWidth * dpr);
      canvas.height = Math.round(window.innerHeight * dpr);

      draw(currentFrameRef.current);
    };

    handleResize();
    window.addEventListener("resize", handleResize, { passive: true });

    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  // Scroll listener
  useEffect(() => {
    const handleScroll = () => {
      const container = containerRef.current;
      if (!container) return;

      const rect = container.getBoundingClientRect();
      const totalScrollable = container.offsetHeight - window.innerHeight;
      if (totalScrollable <= 0) return;

      const scrolled = -rect.top;
      const rawProgress = scrolled / totalScrollable;
      const progress = Math.min(Math.max(rawProgress, 0), 1);

      targetFrameRef.current = 1 + progress * (TOTAL_FRAMES - 1);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();

    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  }, [containerRef]);

  // Persistent Animation Loop with smooth lerp
  useEffect(() => {
    let animId: number;
    let lastTime = performance.now();

    const loop = (time: number) => {
      const dt = Math.min((time - lastTime) / 1000, 0.1);
      lastTime = time;

      const target = targetFrameRef.current;
      let current = currentFrameRef.current;

      if (isReducedMotionRef.current) {
        current = target;
      } else {
        const factor = 1 - Math.exp(-12 * dt);
        const diff = target - current;
        if (Math.abs(diff) > 0.001) {
          current += diff * factor;
        } else {
          current = target;
        }
      }

      currentFrameRef.current = current;
      draw(current);

      animId = requestAnimationFrame(loop);
    };

    animId = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(animId);
    };
  }, []);

  return (
    <>
      {/* Underlying Instant Fallback Image - Guarantees zero black screen from millisecond 0 */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/frames/frame_001.jpg"
        alt="DreamFrame background sequence"
        className="absolute inset-0 w-full h-full object-cover z-0 pointer-events-none select-none"
      />

      {/* Main High-Performance Canvas Scrub Layer */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full object-cover z-[1] pointer-events-none"
        style={{ display: "block" }}
      />
    </>
  );
}

export default function Home() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={containerRef}
      className="relative w-full h-[450vh] bg-[#07060e] text-white"
    >
      {/* Sticky Full-Screen Viewport Layer */}
      <div className="sticky top-0 h-screen w-full overflow-hidden flex flex-col justify-between">
        {/* Full-Screen Scroll-Linked Image Sequence Canvas */}
        <ScrollCanvas containerRef={containerRef} />

        {/* Ambient Dark Futuristic Overlays: Subtle Purple / Violet / Cyan Accents */}
        <div className="absolute inset-0 pointer-events-none z-[1] bg-gradient-to-b from-[#07060e]/60 via-transparent to-[#07060e]/80" />
        <div className="absolute inset-0 pointer-events-none z-[1] bg-[radial-gradient(circle_at_50%_35%,rgba(168,85,247,0.12),transparent_75%)]" />
        <div className="absolute inset-0 pointer-events-none z-[1] shadow-[inset_0_0_120px_rgba(7,6,14,0.95)]" />

        {/* Top Navigation Bar: FastRank Digital Logo, Glass Pill Nav, Get a Free Quote CTA */}
        <header className="relative z-30 w-full pt-5 sm:pt-7 px-4 sm:px-8 lg:px-12 flex items-center justify-between">
          
          {/* Left Brand Lockup: Stylized FR Icon + FASTRANK DIGITAL */}
          <a href="/" className="flex items-center gap-3 group">
            {/* Geometric Gradient FR Logo */}
            <div className="relative w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center shrink-0">
              <svg
                width="40"
                height="40"
                viewBox="0 0 40 40"
                fill="none"
                className="w-full h-full drop-shadow-[0_0_14px_rgba(168,85,247,0.55)] transition-transform duration-300 group-hover:scale-105"
              >
                <defs>
                  <linearGradient id="fr-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#c084fc" />
                    <stop offset="50%" stopColor="#818cf8" />
                    <stop offset="100%" stopColor="#38bdf8" />
                  </linearGradient>
                </defs>
                <path
                  d="M6 7C6 5.89543 6.89543 5 8 5H24C25.1046 5 26 5.89543 26 7V11C26 12.1046 25.1046 13 24 13H14V17H22C23.1046 17 24 17.8954 24 19V22C24 23.1046 23.1046 24 22 24H14V34C14 34.5523 13.5523 35 13 35H7C6.44772 35 6 34.5523 6 34V7Z"
                  fill="url(#fr-gradient)"
                />
                <path
                  d="M23 21L33 34C33.4 34.6 32.9 35 32 35H25.5C24.8 35 24.2 34.6 23.8 34L17.5 25L21.5 21H23Z"
                  fill="url(#fr-gradient)"
                  opacity="0.95"
                />
              </svg>
            </div>

            {/* Typography Brandmark */}
            <div className="flex flex-col leading-none">
              <span className="font-extrabold text-base sm:text-lg tracking-wider text-white">
                FASTRANK
              </span>
              <span className="text-[9px] sm:text-[10px] font-medium tracking-[0.28em] text-white/70 uppercase mt-0.5">
                DIGITAL
              </span>
            </div>
          </a>

          {/* Center Frosted Glass Capsule Navigation */}
          <nav
            aria-label="Main Navigation"
            className="hidden md:flex items-center gap-7 lg:gap-9 glass-pill-nav rounded-full px-7 lg:px-9 py-2.5 sm:py-3 shadow-2xl"
          >
            <a
              href="#home"
              className="relative text-xs font-semibold tracking-[0.2em] uppercase text-purple-300 transition-colors after:absolute after:-bottom-1.5 after:left-0 after:right-0 after:h-[2px] after:bg-purple-500 after:rounded-full after:shadow-[0_0_8px_rgba(168,85,247,0.8)]"
            >
              HOME
            </a>
            <a
              href="#services"
              className="text-xs font-medium tracking-[0.2em] uppercase text-white/70 hover:text-white transition-colors duration-200"
            >
              SERVICES
            </a>
            <a
              href="#about"
              className="text-xs font-medium tracking-[0.2em] uppercase text-white/70 hover:text-white transition-colors duration-200"
            >
              ABOUT
            </a>
            <a
              href="#portfolio"
              className="text-xs font-medium tracking-[0.2em] uppercase text-white/70 hover:text-white transition-colors duration-200"
            >
              PORTFOLIO
            </a>
            <a
              href="#blog"
              className="text-xs font-medium tracking-[0.2em] uppercase text-white/70 hover:text-white transition-colors duration-200"
            >
              BLOG
            </a>
            <a
              href="#contact"
              className="text-xs font-medium tracking-[0.2em] uppercase text-white/70 hover:text-white transition-colors duration-200"
            >
              CONTACT
            </a>
          </nav>

          {/* Right Top Action: Get A Free Quote CTA & Mobile Hamburger */}
          <div className="flex items-center gap-3">
            <a
              href="#quote"
              className="hidden sm:inline-flex items-center gap-1.5 px-5 sm:px-6 py-2.5 rounded-full text-xs font-semibold tracking-wider uppercase text-white fastrank-btn-gradient cursor-pointer select-none"
            >
              <span>GET A FREE QUOTE</span>
              <span className="text-sm font-bold">→</span>
            </a>

            {/* Mobile Hamburger Toggle Button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden flex items-center justify-center p-2 rounded-full glass-pill-nav text-white/90 hover:text-white focus:outline-none"
              aria-label="Toggle Navigation Menu"
              aria-expanded={mobileMenuOpen}
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                {mobileMenuOpen ? (
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M6 18L18 6M6 6l12 12"
                  />
                ) : (
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M4 6h16M4 12h16M4 18h16"
                  />
                )}
              </svg>
            </button>
          </div>
        </header>

        {/* Mobile Menu Dropdown Modal */}
        {mobileMenuOpen && (
          <div className="fixed inset-x-4 top-20 z-40 md:hidden glass-pill-nav rounded-2xl p-6 flex flex-col items-center gap-4 border border-white/20 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <a
              href="#home"
              onClick={() => setMobileMenuOpen(false)}
              className="text-xs font-semibold tracking-[0.22em] uppercase text-purple-300"
            >
              HOME
            </a>
            <a
              href="#services"
              onClick={() => setMobileMenuOpen(false)}
              className="text-xs font-medium tracking-[0.22em] uppercase text-white/80 hover:text-white"
            >
              SERVICES
            </a>
            <a
              href="#about"
              onClick={() => setMobileMenuOpen(false)}
              className="text-xs font-medium tracking-[0.22em] uppercase text-white/80 hover:text-white"
            >
              ABOUT
            </a>
            <a
              href="#portfolio"
              onClick={() => setMobileMenuOpen(false)}
              className="text-xs font-medium tracking-[0.22em] uppercase text-white/80 hover:text-white"
            >
              PORTFOLIO
            </a>
            <a
              href="#blog"
              onClick={() => setMobileMenuOpen(false)}
              className="text-xs font-medium tracking-[0.22em] uppercase text-white/80 hover:text-white"
            >
              BLOG
            </a>
            <a
              href="#contact"
              onClick={() => setMobileMenuOpen(false)}
              className="text-xs font-medium tracking-[0.22em] uppercase text-white/80 hover:text-white"
            >
              CONTACT
            </a>
            <div className="w-16 h-px bg-white/15 my-1" />
            <a
              href="#quote"
              onClick={() => setMobileMenuOpen(false)}
              className="w-full py-2.5 rounded-full text-center text-xs font-semibold tracking-wider uppercase text-white fastrank-btn-gradient"
            >
              GET A FREE QUOTE →
            </a>
          </div>
        )}

        {/* Main Hero Section Content Grid */}
        <div className="relative z-10 w-full max-w-7xl mx-auto px-6 sm:px-10 lg:px-14 pb-8 sm:pb-12 pt-24 sm:pt-32 flex-1 flex flex-col justify-end">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-end">
            
            {/* Lower Left Column: Tagline, Oversized Title, Subline, Services List */}
            <div className="lg:col-span-8 flex flex-col items-start">
              
              {/* Pre-title Tagline: DIGITAL MARKETING AGENCY */}
              <div className="flex items-center gap-2.5 mb-2.5 sm:mb-3">
                <span className="h-[2px] w-6 bg-gradient-to-r from-purple-400 to-cyan-400 rounded-full" />
                <span className="text-[11px] sm:text-xs font-semibold tracking-[0.24em] uppercase text-white/90">
                  DIGITAL MARKETING AGENCY
                </span>
              </div>

              {/* Oversized Brand Title: FASTRANK (White) + DIGITAL (Purple to Cyan Gradient) */}
              <h1 className="text-4xl sm:text-6xl md:text-7xl lg:text-[5.5rem] xl:text-[6.5rem] font-black tracking-tight uppercase leading-none drop-shadow-[0_12px_28px_rgba(0,0,0,0.85)] select-none">
                <span className="text-white">FASTRANK</span>{" "}
                <span className="bg-gradient-to-r from-[#c084fc] via-[#818cf8] to-[#38bdf8] bg-clip-text text-transparent">
                  DIGITAL
                </span>
              </h1>

              {/* Sub-headline: Rank Higher. Get More Customers. */}
              <p className="mt-3 sm:mt-4 text-lg sm:text-xl md:text-2xl text-white/90 font-light tracking-wide drop-shadow-md">
                <span className="text-white/95 font-medium">Rank Higher. </span>
                <span className="font-semibold bg-gradient-to-r from-purple-300 via-indigo-300 to-cyan-300 bg-clip-text text-transparent">
                  Get More Customers.
                </span>
              </p>

              {/* Bottom Left: OUR SERVICES with styled bullet items */}
              <div className="pt-7 sm:pt-10">
                <span className="text-[10px] sm:text-[11px] font-semibold tracking-[0.25em] text-white/50 uppercase block mb-2.5">
                  OUR SERVICES
                </span>
                <div className="flex flex-wrap items-center gap-x-4 sm:gap-x-6 gap-y-2 text-xs sm:text-sm text-white/85 font-medium">
                  <span className="flex items-center gap-1.5 hover:text-white transition-colors">
                    <span className="text-purple-400 text-sm font-bold">•</span> SEO
                  </span>
                  <span className="flex items-center gap-1.5 hover:text-white transition-colors">
                    <span className="text-purple-400 text-sm font-bold">•</span> Google Ads
                  </span>
                  <span className="flex items-center gap-1.5 hover:text-white transition-colors">
                    <span className="text-purple-400 text-sm font-bold">•</span> Social Media
                  </span>
                  <span className="flex items-center gap-1.5 hover:text-white transition-colors">
                    <span className="text-cyan-400 text-sm font-bold">•</span> Web Development
                  </span>
                  <span className="flex items-center gap-1.5 hover:text-white transition-colors">
                    <span className="text-cyan-400 text-sm font-bold">•</span> Content Marketing
                  </span>
                </div>
              </div>
            </div>

            {/* Lower Right Column: Purple-to-Cyan Pill CTA & Cursive Signature */}
            <div className="lg:col-span-4 flex flex-col items-start lg:items-end text-left lg:text-right pb-1 sm:pb-3">
              
              {/* GET STARTED → Gradient Pill Button */}
              <a
                href="#start"
                className="group relative inline-flex items-center justify-center gap-2.5 px-8 sm:px-10 py-3.5 sm:py-4 rounded-full text-xs sm:text-sm font-bold tracking-[0.2em] uppercase text-white fastrank-btn-gradient cursor-pointer select-none"
              >
                <span>GET STARTED</span>
                <span className="text-sm transition-transform duration-300 group-hover:translate-x-1.5">
                  →
                </span>
              </a>

              {/* Angled Handwritten / Cursive Script: "Your Growth Our Mission" */}
              <div className="mt-5 sm:mt-7 font-handwriting text-2xl sm:text-3xl text-white/95 leading-tight tracking-wide drop-shadow-lg -rotate-6 select-none">
                <span>Your Growth</span>
                <br />
                <span className="text-purple-200">Our Mission</span>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Corner Sparkling 4-Point Star Element */}
        <div
          aria-hidden="true"
          className="absolute bottom-5 right-5 sm:bottom-8 sm:right-10 z-20 pointer-events-none animate-sparkle-glow opacity-70 hover:opacity-100 transition-opacity"
        >
          <svg
            width="26"
            height="26"
            viewBox="0 0 24 24"
            fill="currentColor"
            className="text-cyan-200/90 drop-shadow-[0_0_14px_rgba(56,189,248,0.9)]"
          >
            <path d="M12 0L14.5 9.5L24 12L14.5 14.5L12 24L9.5 14.5L0 12L9.5 9.5L12 0Z" />
          </svg>
        </div>
      </div>
    </div>
  );
}
