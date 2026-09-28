import React, { useState, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { Sparkles, ShieldCheck, Zap, ArrowRight, CheckCircle2, X } from 'lucide-react';
import { useApp } from '../../context/AppContext.js';

export const Onboarding3DModal: React.FC = () => {
  const { onboardingOpen, setOnboardingOpen, openAuthModal, user, setActiveView } = useApp();
  const [currentStep, setCurrentStep] = useState(0);
  const canvasRef = useRef<HTMLDivElement>(null);

  const steps = [
    {
      title: 'Institutional Social Media Pipeline',
      subtitle: 'Powered by P Engine',
      description:
        'Access premium tier follower pools, high-retention video views, and algorithm engagement across Instagram, TikTok, YouTube, Telegram, and X with instantaneous delivery.',
      icon: Zap,
      badge: 'Step 1 of 3 — High-Speed Fulfillment'
    },
    {
      title: 'Autonomous Live Tracking & Margins',
      subtitle: 'Real-time synchronization without manual refresh',
      description:
        'Watch your start counts, live remaining balance, and automated 30-day refills in real-time. Built with a strict ₦2,000 platform margin floor and protected server-side accounting.',
      icon: ShieldCheck,
      badge: 'Step 2 of 3 — Live Reliability'
    },
    {
      title: 'Dual NGN & USDT Settlement Ledger',
      subtitle: 'Paystack Instant Credits & Crypto Verification',
      description:
        'Fund seamlessly in Nigerian Naira (NGN) via Paystack or deposit USDT (TRC-20) with immutable ledger tracking and WhatsApp agent support at your fingertips.',
      icon: Sparkles,
      badge: 'Step 3 of 3 — Financial Architecture'
    }
  ];

  // 3D Canvas initialization for onboarding background
  useEffect(() => {
    if (!onboardingOpen) return;
    const container = canvasRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, container.clientWidth / container.clientHeight, 0.1, 100);
    camera.position.z = 5;

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    // Dynamic morphing geometry based on step
    const geo = new THREE.TorusKnotGeometry(1.2, 0.35, 100, 16);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x4f46e5,
      wireframe: true,
      transparent: true,
      opacity: 0.4
    });
    const knot = new THREE.Mesh(geo, mat);
    scene.add(knot);

    let frameId: number;
    const animate = () => {
      frameId = requestAnimationFrame(animate);
      knot.rotation.x += 0.008;
      knot.rotation.y += 0.012;
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(frameId);
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      geo.dispose();
      mat.dispose();
      renderer.dispose();
    };
  }, [onboardingOpen]);

  if (!onboardingOpen) return null;

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(prev => prev + 1);
    } else {
      setOnboardingOpen(false);
      if (user) {
        setActiveView('dashboard');
      } else {
        openAuthModal('register');
      }
    }
  };

  const CurrentIcon = steps[currentStep].icon;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <div className="relative w-full max-w-2xl bg-[#0b0f19] border border-slate-800/80 rounded-2xl shadow-2xl overflow-hidden text-slate-100 flex flex-col">
        {/* Top Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800/60 bg-slate-900/40">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-ping" />
            <span className="text-xs font-semibold uppercase tracking-widest text-cyan-400">
              {steps[currentStep].badge}
            </span>
          </div>
          <button
            onClick={() => setOnboardingOpen(false)}
            className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 3D Visual Centerpiece */}
        <div className="relative h-60 w-full bg-gradient-to-b from-[#07090e] to-[#0b0f19] flex items-center justify-center overflow-hidden">
          <div ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />
          <div className="relative z-10 w-16 h-16 rounded-2xl bg-indigo-600/30 border border-indigo-500/40 backdrop-blur-md flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <CurrentIcon className="w-8 h-8 text-cyan-300" />
          </div>
        </div>

        {/* Content Body */}
        <div className="p-6 md:p-8 space-y-4">
          <div className="space-y-1">
            <h3 className="text-2xl font-bold font-display tracking-tight text-white">
              {steps[currentStep].title}
            </h3>
            <p className="text-sm font-medium text-cyan-400">
              {steps[currentStep].subtitle}
            </p>
          </div>

          <p className="text-sm md:text-base text-slate-300 leading-relaxed">
            {steps[currentStep].description}
          </p>

          {/* Stepper Dots */}
          <div className="flex items-center gap-2 pt-2">
            {steps.map((_, i) => (
              <button
                key={i}
                onClick={() => setCurrentStep(i)}
                className={`h-2 rounded-full transition-all duration-300 ${
                  i === currentStep
                    ? 'w-8 bg-cyan-400'
                    : 'w-2 bg-slate-700 hover:bg-slate-600'
                }`}
                aria-label={`Go to step ${i + 1}`}
              />
            ))}
          </div>
        </div>

        {/* Actions Footer */}
        <div className="px-6 md:px-8 py-4 bg-slate-900/60 border-t border-slate-800/60 flex items-center justify-between">
          <button
            onClick={() => setOnboardingOpen(false)}
            className="text-xs font-medium text-slate-400 hover:text-slate-200 transition"
          >
            Skip Walkthrough
          </button>

          <button
            onClick={handleNext}
            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-cyan-500 hover:from-indigo-500 hover:to-cyan-400 text-white font-medium text-sm flex items-center gap-2 shadow-lg shadow-indigo-500/25 transition cursor-pointer"
          >
            {currentStep === steps.length - 1 ? (
              <>
                <span>Enter Platform</span>
                <CheckCircle2 className="w-4 h-4" />
              </>
            ) : (
              <>
                <span>Continue</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
