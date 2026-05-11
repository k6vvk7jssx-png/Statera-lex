"use client";

import { useUser, SignIn, SignInButton } from "@clerk/nextjs";
import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { dark } from "@clerk/themes";
import { Scale, ChevronDown, CheckCircle2, Calculator, ShieldCheck, Mail, ArrowRight, Zap, PieChart, Coins, Sparkles, Lock, FileSpreadsheet } from "lucide-react";

export default function Home() {
  const { isLoaded, isSignedIn } = useUser();
  const router = useRouter();

  // Simulatore State
  const [simLordo, setSimLordo] = useState<string>("50000");
  const [simRegime, setSimRegime] = useState<"forfettario_5" | "forfettario_15" | "ordinario">("forfettario_15");
  const [simScaglione, setSimScaglione] = useState<number>(43);
  const [simOmnia, setSimOmnia] = useState(false);

  useEffect(() => {
    if (isLoaded && isSignedIn) {
      router.push('/dashboard');
    }
  }, [isLoaded, isSignedIn, router]);

  // Simulatore Fiscale Logica
  const calcoloSimulatore = useMemo(() => {
    let importoLordo = parseFloat(simLordo) || 0;
    if (simOmnia && importoLordo > 0) {
      importoLordo = importoLordo / 1.196;
    }

    const CASSA_ALIQUOTA_BASE = 0.17;
    const CASSA_ALIQUOTA_ECCEDENZA = 0.03;
    const CASSA_TETTO = 135000;
    const CASSA_MATERNITA_ANNUALE = 100; // Quota fissa maternità

    if (simRegime.startsWith("forfettario")) {
      const compensoBase = importoLordo;
      const speseGenerali = compensoBase * 0.15;
      const redditoImponibileLordo = (compensoBase + speseGenerali) * 0.78;

      let cassaSoggettiva = 0;
      if (redditoImponibileLordo <= CASSA_TETTO) {
        cassaSoggettiva = redditoImponibileLordo * CASSA_ALIQUOTA_BASE;
      } else {
        cassaSoggettiva = (CASSA_TETTO * CASSA_ALIQUOTA_BASE) + ((redditoImponibileLordo - CASSA_TETTO) * CASSA_ALIQUOTA_ECCEDENZA);
      }
      cassaSoggettiva += CASSA_MATERNITA_ANNUALE; // Aggiunta maternità
      const cpa = (compensoBase + speseGenerali) * 0.04;
      const cassaTotale = cassaSoggettiva + cpa;

      const baseImponibileNetta = Math.max(0, redditoImponibileLordo - cassaSoggettiva);
      const aliquota = simRegime === "forfettario_5" ? 0.05 : 0.15;
      const tasse = baseImponibileNetta * aliquota;

      const volumeAffariLordo = compensoBase + speseGenerali + cpa;
      const nettoStima = volumeAffariLordo - tasse - cassaTotale;
      return { tasse, cassa: cassaTotale, netto: nettoStima, volumeAffariLordo, ritenuta: 0 };
    } else {
      const compensoBase = importoLordo;
      const speseGenerali = compensoBase * 0.15;
      const imponibileLordo = compensoBase + speseGenerali;
      const speseDeducibili = 0;

      const imponibileCassa = Math.max(0, imponibileLordo - speseDeducibili);
      let cassaSoggettiva = 0;
      if (imponibileCassa <= CASSA_TETTO) {
          cassaSoggettiva = imponibileCassa * CASSA_ALIQUOTA_BASE;
      } else {
          cassaSoggettiva = (CASSA_TETTO * CASSA_ALIQUOTA_BASE) + ((imponibileCassa - CASSA_TETTO) * CASSA_ALIQUOTA_ECCEDENZA);
      }
      cassaSoggettiva += CASSA_MATERNITA_ANNUALE; // Aggiunta maternità
      const cpa = imponibileLordo * 0.04;
      const cassaTotale = cassaSoggettiva + cpa;

      const ivaDaVersare = (imponibileLordo + cpa) * 0.22;
      const ritenutaScontata = imponibileLordo * 0.20;

      const imponibileIrpef = Math.max(0, imponibileCassa - cassaSoggettiva);
      
      let irpefLorda = 0.0;
      if (imponibileIrpef > 0) {
        const primo_scaglione = Math.min(imponibileIrpef, 28000);
        irpefLorda += primo_scaglione * 0.23;
        
        if (imponibileIrpef > 28000) {
          const secondo_scaglione = Math.min(imponibileIrpef - 28000, 22000);
          irpefLorda += secondo_scaglione * 0.33;
        }
        
        if (imponibileIrpef > 50000) {
          const terzo_scaglione = imponibileIrpef - 50000;
          irpefLorda += terzo_scaglione * 0.43;
        }
      }

      const irpefaSaldo = Math.max(0, irpefLorda - ritenutaScontata);

      const addizionali = imponibileIrpef * 0.03;
      const tasse = ivaDaVersare + irpefaSaldo + addizionali;

      const volumeAffariLordo = imponibileLordo + cpa + ivaDaVersare;
      const nettoStima = volumeAffariLordo - tasse - cassaTotale - ritenutaScontata - speseDeducibili;

      return { tasse, cassa: cassaTotale, netto: nettoStima, volumeAffariLordo, ritenuta: ritenutaScontata };
    }
  }, [simLordo, simRegime, simScaglione, simOmnia]);

  if (!isLoaded || isSignedIn) {
    return (
      <div className="min-h-screen bg-[#111827] flex justify-center items-center">
        <motion.div
          animate={{ scale: [1, 1.2, 1], opacity: [0.5, 1, 0.5] }}
          transition={{ repeat: Infinity, duration: 2 }}
          className="w-12 h-12 border-4 border-[#007AFF] border-t-transparent rounded-full animate-spin"
        />
      </div>
    );
  }

  const scrollDown = () => {
    window.scrollTo({ top: window.innerHeight, behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen font-sans bg-[#0c1017] text-slate-200 selection:bg-[#007AFF]/30 overflow-x-hidden">

      {/* NAVBAR */}
      <nav className="fixed top-0 w-full z-50 bg-[#0c1017]/80 backdrop-blur-md border-b border-white/5 px-6 py-4 flex justify-between items-center transition-all">
        <div className="flex items-center gap-3">
          <div className="bg-[#007AFF] p-2 rounded-xl shadow-lg shadow-[#007AFF]/20">
            <Scale className="w-6 h-6 text-white" strokeWidth={2} />
          </div>
          <span className="text-xl font-bold tracking-tight text-white hidden sm:block">StateraLex</span>
        </div>
        <div className="flex items-center gap-4">
          {/* Pulsanti Clerk Modal */}
          <SignInButton mode="modal" fallbackRedirectUrl="/dashboard">
            <button className="text-sm font-medium text-slate-300 hover:text-white transition-colors cursor-pointer">
              Accedi
            </button>
          </SignInButton>
          <SignInButton mode="modal" fallbackRedirectUrl="/dashboard">
            <button className="bg-[#007AFF] hover:bg-[#005bb5] text-white px-5 py-2 rounded-full text-sm font-semibold transition-all shadow-lg shadow-[#007AFF]/20 flex items-center gap-2 cursor-pointer">
              Inizia Ora <ArrowRight className="w-4 h-4" />
            </button>
          </SignInButton>
        </div>
      </nav>

      {/* HERO SECTION - Proton Drive Style */}
      <section className="relative min-h-screen flex flex-col justify-center pt-24 pb-16 px-6 lg:px-16 lg:flex-row lg:items-center overflow-hidden">

        {/* Sfondo Astratto */}
        <div className="absolute top-[-10%] left-[-20%] w-[800px] h-[800px] bg-gradient-to-br from-[#007AFF]/20 via-purple-900/10 to-transparent blur-[120px] rounded-full pointer-events-none mix-blend-screen" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[600px] h-[600px] bg-gradient-to-tl from-emerald-500/10 via-teal-900/10 to-transparent blur-[100px] rounded-full pointer-events-none mix-blend-screen" />

        {/* Copy Sinistra (Marketing Hook) */}
        <div className="relative z-10 lg:w-1/2 lg:pr-12 max-w-3xl mx-auto lg:mx-0 text-center lg:text-left pt-10 lg:pt-0">

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="inline-flex items-center gap-2 px-4 py-2 mb-8 rounded-full bg-[#007AFF]/10 border border-[#007AFF]/20 text-[#007AFF] text-sm font-semibold"
          >
            <Sparkles className="w-4 h-4" />
            <span>Nuovo Motore Fiscale 2026. Riservato Avvocati.</span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="text-5xl md:text-6xl lg:text-[4.5rem] font-extrabold tracking-tight leading-[1.1] text-white mb-6"
          >
            Scopri quanto guadagni davvero. <br />
            Smetti di temere l'F24. <br />
            Passa a <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#007AFF] to-[#00bfff]">StateraLex</span>.
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="text-lg md:text-xl text-slate-400 mb-10 leading-relaxed max-w-2xl mx-auto lg:mx-0"
          >
            Smetti di usare fogli Excel o calcolatori generici. Automatizza il calcolo di <strong className="text-slate-200">Cassa Forense, IRPEF e Deduzioni</strong>. Fatto in Italia, per la normativa Italiana.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-4"
          >
            <SignInButton mode="modal" fallbackRedirectUrl="/dashboard">
              <button className="w-full sm:w-auto bg-white text-black px-8 py-4 rounded-xl font-bold text-lg hover:bg-slate-200 transition-colors shadow-xl flex items-center justify-center gap-2">
                Prova Gratis <ArrowRight className="w-5 h-5" />
              </button>
            </SignInButton>
            <a href="#features-section" className="w-full sm:w-auto bg-white/5 border border-white/10 hover:bg-white/10 text-white px-8 py-4 rounded-xl font-semibold text-lg transition-colors flex items-center justify-center gap-2">
              Scopri le funzioni
            </a>
          </motion.div>

          {/* Trust Indicators */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1, delay: 0.6 }}
            className="mt-12 pt-8 border-t border-white/10 flex flex-wrap justify-center lg:justify-start items-center gap-x-8 gap-y-4 text-sm text-slate-500 font-medium"
          >
            <div className="flex items-center gap-2"><ShieldCheck className="w-4 h-4" /> Niente Data-Selling</div>
            <div className="flex items-center gap-2"><Lock className="w-4 h-4" /> Privacy First</div>
            <div className="flex items-center gap-2"><ShieldCheck className="w-4 h-4" /> Calcoli a Norma</div>
          </motion.div>
        </div>

        {/* Simulatore Destra (Il Prodotto Interattivo in Hero) */}
        <motion.div
          initial={{ opacity: 0, x: 50 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.7, delay: 0.3, type: "spring", stiffness: 100 }}
          className="relative z-20 lg:w-1/2 mt-16 lg:mt-0 max-w-lg mx-auto w-full lg:ml-auto"
        >
          {/* Decorazione Dietro il Widget */}
          <div className="absolute inset-0 bg-gradient-to-tr from-[#007AFF]/20 to-purple-500/20 blur-3xl rounded-full transform scale-110 pointer-events-none" />

          <div className="bg-[#18212f]/80 backdrop-blur-2xl border border-white/10 rounded-[2rem] p-8 shadow-2xl relative overflow-hidden">

            {/* Subtle top glare */}
            <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />

            <div className="flex items-center gap-3 mb-8">
              <div className="p-2.5 bg-[#007AFF]/10 text-[#007AFF] rounded-xl"><Calculator className="w-6 h-6" /></div>
              <h3 className="text-2xl font-bold tracking-tight text-white">Simulatore Fiscale</h3>
            </div>

            <div className="space-y-6">
              <div>
                <label className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-2 block">Il tuo Compenso Base</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-medium text-lg">€</span>
                  <input
                    type="number"
                    value={simLordo}
                    onChange={(e) => setSimLordo(e.target.value)}
                    className="w-full bg-black/30 border border-white/10 rounded-xl py-4 pl-10 pr-4 text-white text-xl font-semibold outline-none focus:border-[#007AFF] focus:ring-1 focus:ring-[#007AFF] transition-all"
                  />
                </div>
                
                <div className="mt-3 flex items-center justify-between bg-white/5 border border-white/10 rounded-xl p-3 cursor-pointer" onClick={() => setSimOmnia(!simOmnia)}>
                    <div className="flex flex-col">
                        <span className="text-sm font-semibold text-white">Fattura Omnia</span>
                        <span className="text-xs text-slate-400">Importo già comprensivo di CPA e 15%</span>
                    </div>
                    <div className={`w-12 h-6 rounded-full transition-colors flex items-center px-1 ${simOmnia ? 'bg-emerald-500' : 'bg-slate-700'}`}>
                        <div className={`w-4 h-4 rounded-full bg-white transition-transform ${simOmnia ? 'translate-x-6' : 'translate-x-0'}`} />
                    </div>
                </div>

                <div className="mt-2 flex justify-between items-center text-xs text-slate-400 px-2">
                  <span>Volume d'Affari Finale (+15%{simRegime === 'ordinario' ? ', CPA, IVA' : ', CPA'})</span>
                  <span className="font-bold text-slate-200">€{calcoloSimulatore.volumeAffariLordo.toLocaleString('it-IT', { maximumFractionDigits: 0 })}</span>
                </div>
              </div>

              <div>
                <label className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-2 block">Regime Fiscale</label>
                <div className="grid grid-cols-3 gap-2 p-1.5 bg-black/30 rounded-xl border border-white/5">
                  <button
                    onClick={() => setSimRegime('forfettario_5')}
                    className={`py-2 text-sm font-medium rounded-lg transition-all ${simRegime === 'forfettario_5' ? 'bg-[#007AFF] text-white shadow-md' : 'text-slate-400 hover:text-white'}`}
                  >
                    Forf. 5%
                  </button>
                  <button
                    onClick={() => setSimRegime('forfettario_15')}
                    className={`py-2 text-sm font-medium rounded-lg transition-all ${simRegime === 'forfettario_15' ? 'bg-[#007AFF] text-white shadow-md' : 'text-slate-400 hover:text-white'}`}
                  >
                    Forf. 15%
                  </button>
                  <button
                    onClick={() => setSimRegime('ordinario')}
                    className={`py-2 text-sm font-medium rounded-lg transition-all ${simRegime === 'ordinario' ? 'bg-[#007AFF] text-white shadow-md' : 'text-slate-400 hover:text-white'}`}
                  >
                    Ordinario
                  </button>
                </div>
              </div>

              {simRegime === 'ordinario' && (
                <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                  <label className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-2 block">Scaglione IRPEF (Simulazione)</label>
                  <div className="grid grid-cols-3 gap-2 p-1.5 bg-black/30 rounded-xl border border-white/5">
                    <button
                      onClick={() => setSimScaglione(23)}
                      className={`py-2 text-sm font-medium rounded-lg transition-all ${simScaglione === 23 ? 'bg-[#007AFF] text-white shadow-md' : 'text-slate-400 hover:text-white'}`}
                    >23%</button>
                    <button
                      onClick={() => setSimScaglione(35)}
                      className={`py-2 text-sm font-medium rounded-lg transition-all ${simScaglione === 35 ? 'bg-[#007AFF] text-white shadow-md' : 'text-slate-400 hover:text-white'}`}
                    >35%</button>
                    <button
                      onClick={() => setSimScaglione(43)}
                      className={`py-2 text-sm font-medium rounded-lg transition-all ${simScaglione === 43 ? 'bg-[#007AFF] text-white shadow-md' : 'text-slate-400 hover:text-white'}`}
                    >43%</button>
                  </div>
                </div>
              )}

              <div className="pt-6 border-t border-white/10 grid grid-cols-2 gap-4">
                <div className="bg-black/20 p-4 rounded-2xl border border-white/5">
                  <p className="text-slate-400 text-xs uppercase tracking-wider font-semibold mb-1">Cassa Forense</p>
                  <p className="text-xl font-bold text-slate-200">€{calcoloSimulatore.cassa.toLocaleString('it-IT', { maximumFractionDigits: 0 })}</p>
                </div>
                <div className="bg-black/20 p-4 rounded-2xl border border-white/5">
                  <p className="text-slate-400 text-xs uppercase tracking-wider font-semibold mb-1">Tasse{simRegime === 'ordinario' ? ' (+IVA)' : ''}</p>
                  <p className="text-xl font-bold text-red-400">€{calcoloSimulatore.tasse.toLocaleString('it-IT', { maximumFractionDigits: 0 })}</p>
                </div>
                
                {simRegime === 'ordinario' && (
                  <div className="col-span-2 bg-black/20 p-3 rounded-xl border border-white/5 flex justify-between items-center px-4">
                    <span className="text-slate-400 text-xs uppercase tracking-wider font-semibold">Ritenuta Da Scontare</span>
                    <span className="text-sm font-bold text-slate-300">- €{calcoloSimulatore.ritenuta.toLocaleString('it-IT', { maximumFractionDigits: 0 })}</span>
                  </div>
                )}
              </div>

              <div className="bg-gradient-to-r from-emerald-500/10 to-emerald-500/5 border border-emerald-500/20 p-6 rounded-2xl flex justify-between items-center">
                <div>
                  <p className="text-emerald-500/80 text-xs uppercase tracking-wider font-bold mb-1">Netto Reale</p>
                  <p className="text-3xl font-extrabold text-white">€{calcoloSimulatore.netto.toLocaleString('it-IT', { maximumFractionDigits: 0 })}</p>
                </div>
                <Coins className="w-10 h-10 text-emerald-400 opacity-80" />
              </div>

              <p className="text-xs text-center text-slate-500 mt-4 leading-relaxed">
                Questa è una simulazione puramente matematica. <br /> Crea il tuo account per aggiungere le vere deduzioni e la registrazione Spese interattiva.
              </p>

            </div>
          </div>
        </motion.div>

        {/* Scroll Indicator */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 animate-bounce cursor-pointer z-20" onClick={scrollDown}>
          <ChevronDown className="w-8 h-8 text-slate-500 hover:text-white transition-colors" />
        </div>
      </section>

      {/* FEATURES GRID SECTION - Proton Style "Why Choose Us" */}
      <section id="features-section" className="py-24 px-6 lg:px-16 bg-[#0c1017] border-t border-white/5 relative">
        <div className="max-w-6xl mx-auto">

          <div className="text-center mb-20">
            <h2 className="text-4xl md:text-5xl font-bold tracking-tight text-white mb-6">Un gestionale fiscale, <span className="text-emerald-400">finalmente utile.</span></h2>
            <p className="text-lg text-slate-400 max-w-2xl mx-auto">Abbiamo ridisegnato il concetto di contabilità per avvocati integrando automatismi, OCR, e intelligenza legale in un&#39;unica app privata.</p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">

            <div className="bg-[#18212f] p-8 rounded-3xl border border-white/5 hover:border-emerald-500/30 transition-all group">
              <div className="bg-emerald-500/10 w-14 h-14 rounded-2xl flex items-center justify-center mb-6 text-emerald-400 group-hover:scale-110 transition-transform">
                <Zap className="w-7 h-7" />
              </div>
              <h3 className="text-xl font-bold text-white mb-3 tracking-tight">Motore di Deducibilità Live</h3>
              <p className="text-slate-400 leading-relaxed text-sm">Inserisci la spesa e l&#39;intelligenza dell&#39;app riduce automaticamente il tuo imponibile in tempo reale a seconda se è un ristorante (75%) o cancelleria (100%).</p>
            </div>

            <div className="bg-[#18212f] p-8 rounded-3xl border border-white/5 hover:border-[#007AFF]/30 transition-all group">
              <div className="bg-[#007AFF]/10 w-14 h-14 rounded-2xl flex items-center justify-center mb-6 text-[#007AFF] group-hover:scale-110 transition-transform">
                <FileSpreadsheet className="w-7 h-7" />
              </div>
              <h3 className="text-xl font-bold text-white mb-3 tracking-tight">Esportazione Commercialista</h3>
              <p className="text-slate-400 leading-relaxed text-sm">Scarica con un clic un report Excel perfetto. 3 fogli separati per Fatture, Spese Deducibili e Riepilogo Fiscale con Cassa Forense pre-calcolata.</p>
            </div>

            <div className="bg-[#18212f] p-8 rounded-3xl border border-white/5 hover:border-purple-500/30 transition-all group lg:col-start-auto md:col-start-1 md:col-span-2 lg:col-span-1">
              <div className="bg-purple-500/10 w-14 h-14 rounded-2xl flex items-center justify-center mb-6 text-purple-400 group-hover:scale-110 transition-transform">
                <PieChart className="w-7 h-7" />
              </div>
              <h3 className="text-xl font-bold text-white mb-3 tracking-tight">Cassetto Previsionale</h3>
              <p className="text-slate-400 leading-relaxed text-sm">Non ti troverai mai scoperto. Il cruscotto calcola separatamente IVA da versare, ritenute d&#39;acconto, Cassa e IRPEF, separando il fatturato dal tuo vero budget.</p>
            </div>

          </div>
        </div>
      </section>

      {/* LOGIN CLERK SECTION / CTA BOTTOM */}
      <section id="login-section" className="py-24 px-6 lg:px-16 bg-gradient-to-b from-[#0c1017] to-[#111827] relative border-t border-white/5">
        <div className="max-w-4xl mx-auto flex flex-col md:flex-row gap-12 items-center">

          {/* Text Left */}
          <div className="flex-1 text-center md:text-left">
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4 tracking-tight">
              Privacy Assoluta. <br />
              Nessun dato trafugabile.
            </h2>
            <div className="text-slate-400 mb-8 max-w-md mx-auto md:mx-0 space-y-4">
              <p>
                L&#39;unica soluzione dedicata alla realtà forense italiana strutturata su architettura <strong>Zero-Trust</strong>. I tuoi dati finanziari sono vincolati algoritmicamente al tuo token crittografico.
              </p>
              <p>
                <strong>StateraLex non ha accesso, non legge, e non può materialmente manipolare, rubare o vendere a terzi</strong> né il tuo fatturato né i dati dei tuoi clienti. L&#39;infrastruttura Cloud blinda le tue fatture tramite protocolli RLS (Row Level Security).
              </p>
            </div>

            <ul className="space-y-3 mb-8 inline-block text-left mx-auto">
              <li className="flex items-center text-sm font-medium text-slate-300">
                <CheckCircle2 className="w-5 h-5 mr-3 text-emerald-400" />
                Crittografia Auth Integrata (JWT)
              </li>
              <li className="flex items-center text-sm font-medium text-slate-300">
                <CheckCircle2 className="w-5 h-5 mr-3 text-emerald-400" />
                Isolamento Inviolabile DB (RLS)
              </li>
              <li className="flex items-center text-sm font-medium text-slate-300">
                <CheckCircle2 className="w-5 h-5 mr-3 text-emerald-400" />
                Conformità GDPR Europea 100%
              </li>
            </ul>
          </div>

          {/* Clerk Right */}
          <div className="w-full max-w-md relative z-10">
            <div className="absolute inset-0 bg-gradient-to-bl from-[#007AFF]/20 to-transparent blur-2xl transform scale-110" />
            <div className="bg-[#18212f]/80 backdrop-blur-3xl border border-white/10 p-2 sm:p-6 rounded-[2rem] shadow-2xl relative">
              <SignIn
                routing="hash"
                appearance={{
                  baseTheme: dark,
                  elements: {
                    card: 'bg-transparent shadow-none w-full sm:p-4',
                    headerTitle: 'text-2xl font-bold text-white tracking-tight',
                    headerSubtitle: 'text-slate-400 font-medium',
                    socialButtonsBlockButton: 'border border-white/10 bg-black/20 hover:bg-black/40 text-white transition-all rounded-[1rem] py-3.5',
                    formButtonPrimary: 'bg-[#007AFF] hover:bg-[#005bb5] text-white shadow-lg shadow-[#007AFF]/20 rounded-[1rem] py-3.5 font-bold tracking-wide mt-2',
                    formFieldInput: 'border-white/10 focus:border-[#007AFF] bg-black/40 rounded-[1rem] py-3.5 px-4 text-white',
                    formFieldLabel: 'text-slate-400 uppercase tracking-wider text-[11px] font-bold',
                    dividerLine: 'bg-white/10',
                    dividerText: 'text-slate-500 font-semibold uppercase tracking-wider bg-transparent',
                    footerActionText: 'text-slate-400',
                    footerActionLink: 'text-[#007AFF] hover:text-[#005bb5] font-semibold'
                  }
                }}
              />
            </div>
          </div>

        </div>
      </section>

      {/* FOOTER */}
      <footer className="bg-[#0b0e14] py-12 px-6 lg:px-16 border-t border-white/5 text-center sm:text-left">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-3 opacity-50">
            <Scale className="w-6 h-6 text-white" />
            <span className="text-xl font-bold tracking-tight text-white">StateraLex</span>
          </div>

          <div className="flex gap-8 text-sm text-slate-500 font-medium">
            <a href="mailto:supporto@gestionecaso.it" className="hover:text-white transition-colors flex items-center gap-2">
              <Mail className="w-4 h-4" /> Conta su di Noi
            </a>
            <a href="#" className="hover:text-white transition-colors">Privacy</a>
            <a href="#" className="hover:text-white transition-colors">Normative</a>
          </div>
        </div>
        <div className="max-w-6xl mx-auto mt-8 text-xs text-slate-600 font-medium text-center sm:text-left leading-relaxed">
          &copy; {new Date().getFullYear()} StateraLex Ltd. Questo gestionale utilizza un&apos;infrastruttura sicura in cui tutti i dati immessi (fatture, importi, spese e clienti) sono criptati e isolati. StateraLex non vende, non condivide e non ha il permesso tecnico di prelevare informazioni personali o finanziarie dei propri utenti per alcuno scopo (pubblicitario o commerciale).
        </div>
      </footer>

    </div>
  );
}
