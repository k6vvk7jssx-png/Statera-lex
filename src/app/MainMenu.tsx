"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { UserButton, useUser } from "@clerk/nextjs";

export interface MainMenuProps {
    isCollapsed?: boolean;
    setIsCollapsed?: (collapsed: boolean) => void;
}

export default function MainMenu({ isCollapsed = false, setIsCollapsed }: MainMenuProps) {
    const pathname = usePathname();
    const { user } = useUser();

    // Helper per verificare se un path è attivo
    const isActive = (path: string) => pathname === path;

    return (
        <>
            {/* MOBILE BOTTOM NAVIGATION (< md) */}
            <nav className="bottom-nav md:hidden">
                <Link href="/dashboard" className={`nav-item ${isActive('/dashboard') ? 'active-nav-safe' : ''}`}>
                    <span className="nav-icon" style={{
                        transform: isActive('/dashboard') ? 'scale(1.2) translateY(-2px)' : 'none',
                        color: isActive('/dashboard') ? '#ffcc00' : 'inherit',
                        transition: 'all 0.2s ease',
                        textShadow: isActive('/dashboard') ? '0 0 15px rgba(255, 204, 0, 0.6)' : 'none'
                    }}>📊</span>
                    <span className="nav-text" style={{
                        color: isActive('/dashboard') ? '#ffcc00' : 'inherit',
                        fontWeight: isActive('/dashboard') ? 'bold' : 'normal'
                    }}>Dashboard</span>
                </Link>

                <Link href="/scanner" className="nav-item">
                    <span
                        className="nav-icon"
                        style={{
                            background: isActive('/scanner') ? '#ffcc00' : 'var(--primary)',
                            color: isActive('/scanner') ? 'black' : 'white',
                            borderRadius: "50%",
                            width: "45px",
                            height: "45px",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            marginBottom: "-15px",
                            border: "4px solid var(--background)",
                            transform: isActive('/scanner') ? "translateY(-13px) scale(1.1)" : "translateY(-10px)",
                            transition: "all 0.3s ease",
                            boxShadow: isActive('/scanner') ? "0 0 20px rgba(255, 204, 0, 0.6)" : "none"
                        }}>
                        📸
                    </span>
                    <span className="nav-text" style={{
                        marginTop: "15px",
                        color: isActive('/scanner') ? '#ffcc00' : 'inherit',
                        fontWeight: isActive('/scanner') ? 'bold' : 'normal'
                    }}>Spese</span>
                </Link>

                <Link href="/tasse" className={`nav-item ${isActive('/tasse') ? 'active-nav-safe' : ''}`}>
                    <span className="nav-icon" style={{
                        transform: isActive('/tasse') ? 'scale(1.2) translateY(-2px)' : 'none',
                        color: isActive('/tasse') ? '#ffcc00' : 'inherit',
                        transition: 'all 0.2s ease',
                        textShadow: isActive('/tasse') ? '0 0 15px rgba(255, 204, 0, 0.6)' : 'none'
                    }}>🧮</span>
                    <span className="nav-text" style={{
                        color: isActive('/tasse') ? '#ffcc00' : 'inherit',
                        fontWeight: isActive('/tasse') ? 'bold' : 'normal'
                    }}>Tasse</span>
                </Link>

                <Link href="/cause" className={`nav-item ${isActive('/cause') ? 'active-nav-safe' : ''}`}>
                    <span className="nav-icon" style={{
                        transform: isActive('/cause') ? 'scale(1.2) translateY(-2px)' : 'none',
                        color: isActive('/cause') ? '#ffcc00' : 'inherit',
                        transition: 'all 0.2s ease',
                        textShadow: isActive('/cause') ? '0 0 15px rgba(255, 204, 0, 0.6)' : 'none'
                    }}>⚖️</span>
                    <span className="nav-text" style={{
                        color: isActive('/cause') ? '#ffcc00' : 'inherit',
                        fontWeight: isActive('/cause') ? 'bold' : 'normal'
                    }}>Cause</span>
                </Link>

                <Link href="/impostazioni" className={`nav-item ${isActive('/impostazioni') ? 'active-nav-safe' : ''}`}>
                    <span className="nav-icon" style={{
                        transform: isActive('/impostazioni') ? 'scale(1.2) translateY(-2px)' : 'none',
                        color: isActive('/impostazioni') ? '#ffcc00' : 'inherit',
                        transition: 'all 0.2s ease',
                        textShadow: isActive('/impostazioni') ? '0 0 15px rgba(255, 204, 0, 0.6)' : 'none'
                    }}>⚙️</span>
                    <span className="nav-text" style={{
                        color: isActive('/impostazioni') ? '#ffcc00' : 'inherit',
                        fontWeight: isActive('/impostazioni') ? 'bold' : 'normal'
                    }}>Impo.</span>
                </Link>
            </nav>

            {/* DESKTOP SIDEBAR (>= md) */}
            <aside 
                className={`hidden md:flex flex-col fixed inset-y-0 left-0 border-r border-white/5 bg-[#0c1017]/80 backdrop-blur-2xl z-50 transition-all duration-300 ease-in-out ${
                    isCollapsed ? 'w-20' : 'w-64'
                }`}
            >

                {/* Logo Area */}
                <div className={`h-16 flex items-center border-b border-white/5 transition-all duration-300 ${isCollapsed ? 'justify-center px-0' : 'justify-between px-6'}`}>
                    {!isCollapsed && <span className="text-lg font-bold tracking-tighter text-white">StateraLex</span>}
                    {setIsCollapsed && (
                        <button 
                            onClick={() => setIsCollapsed(!isCollapsed)}
                            className={`p-2 rounded-lg hover:bg-white/10 text-white/70 hover:text-white transition-all duration-300 ${isCollapsed ? '' : ''}`}
                            title={isCollapsed ? "Espandi" : "Comprimi"}
                        >
                            <svg 
                                width="18" 
                                height="18" 
                                viewBox="0 0 24 24" 
                                fill="none" 
                                stroke="currentColor" 
                                strokeWidth="2" 
                                strokeLinecap="round" 
                                strokeLinejoin="round"
                                style={{ transform: isCollapsed ? 'rotate(0deg)' : 'rotate(180deg)', transition: 'transform 0.3s ease' }}
                            >
                                <polyline points="9 18 15 12 9 6" />
                            </svg>
                        </button>
                    )}
                </div>

                {/* Nav Links */}
                <div className={`flex-1 py-6 flex flex-col gap-2 overflow-y-auto ${isCollapsed ? 'px-2 items-center' : 'px-3'}`}>
                    {[
                        { href: "/dashboard", icon: "📊", label: "Dashboard" },
                        { href: "/scanner", icon: "💵", label: "Spese" },
                        { href: "/tasse", icon: "🧮", label: "Cassetto Fiscale" },
                        { href: "/cause", icon: "⚖️", label: "Fatture / Cause" },
                        { href: "/impostazioni", icon: "⚙️", label: "Impostazioni" }
                    ].map((item) => (
                        <Link
                            key={item.href}
                            href={item.href}
                            title={isCollapsed ? item.label : undefined}
                            className={`flex items-center rounded-xl transition-all ${
                                isCollapsed ? 'justify-center w-12 h-12 p-0' : 'justify-start w-full gap-4 px-4 py-3'
                            } ${isActive(item.href)
                                ? `bg-[#18212f] text-white ${isCollapsed ? 'border-2 border-[#ffcc00]' : 'border-l-4 border-l-[#ffcc00]'}`
                                : `text-slate-400 hover:bg-[#18212f]/50 hover:text-white ${isCollapsed ? 'border-2 border-transparent' : 'border-l-4 border-l-transparent'}`
                                }`}
                        >
                            <span className={`${isCollapsed ? 'text-2xl' : 'text-xl'}`} style={{ filter: isActive(item.href) ? "drop-shadow(0 0 8px rgba(255, 204, 0, 0.4))" : "none" }}>
                                {item.icon}
                            </span>
                            {!isCollapsed && (
                                <span className={`font-medium ${isActive(item.href) ? "text-[#ffcc00]" : ""}`}>
                                    {item.label}
                                </span>
                            )}
                        </Link>
                    ))}
                </div>

                {/* User Area Bottom */}
                <div className="p-4 border-t border-white/5 w-full flex justify-center">
                    <div className={`flex items-center transition-all bg-[#18212f]/50 p-2 rounded-xl ${isCollapsed ? 'justify-center w-full gap-0' : 'w-full gap-3'}`}>
                        <UserButton afterSignOutUrl="/" appearance={{ elements: { userButtonAvatarBox: "w-9 h-9" } }} />
                        {!isCollapsed && (
                            <div className="flex flex-col overflow-hidden">
                                <span className="text-sm font-semibold text-white truncate">{user?.firstName || 'Avvocato'}</span>
                                <span className="text-xs text-slate-500 truncate">{user?.primaryEmailAddress?.emailAddress}</span>
                            </div>
                        )}
                    </div>
                </div>
            </aside>
        </>
    );
}
