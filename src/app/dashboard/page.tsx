"use client";

import { useState, useEffect, useCallback } from "react";
import { ArcElement, Chart as ChartJS, Legend, Tooltip } from "chart.js";
import { Pie } from "react-chartjs-2";
import { useUser, useSession } from "@clerk/nextjs";
import { createClient } from "@supabase/supabase-js";
import { CheckCircle2, XCircle, Trash2 } from "lucide-react";
import ExportCommercialistaButton from "@/components/ExportCommercialistaButton";
import { useExpenseContext } from "@/context/ExpenseContext";
import { getProfiloAction } from "@/app/impostazioni/actions";
import AiAdvisor from "@/components/AiAdvisor";
import AnnualDashboardModal from "@/components/AnnualDashboardModal";

ChartJS.register(ArcElement, Tooltip, Legend);

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const categorieIniziali = [
  { nome: "Alimenti", totale: 0, icona: "🛒" },
  { nome: "Ristoranti", totale: 0, icona: "🍽️" },
  { nome: "Salute", totale: 0, icona: "💊" },
  { nome: "Lavoro", totale: 0, icona: "💼" },
  { nome: "Cancelleria", totale: 0, icona: "📎" },
  { nome: "Software", totale: 0, icona: "💻" },
  { nome: "Telefonia", totale: 0, icona: "📱" },
  { nome: "Auto/Trasporti", totale: 0, icona: "🚗" },
  { nome: "Carburante", totale: 0, icona: "⛽" },
  { nome: "Viaggi", totale: 0, icona: "🚆" },
  { nome: "Spese Clienti", totale: 0, icona: "🤝" },
  { nome: "Rappresentanza", totale: 0, icona: "🍾" },
  { nome: "Tasse", totale: 0, icona: "🏛️" },
  { nome: "Senza Tasse", totale: 0, icona: "🆓" },
  { nome: "Utenze", totale: 0, icona: "💡" },
  { nome: "Affitto", totale: 0, icona: "🏠" },
  { nome: "Formazione", totale: 0, icona: "📚" },
  { nome: "Abbigliamento", totale: 0, icona: "⚖️" },
  { nome: "Imprevisti", totale: 0, icona: "⚠️" },
  { nome: "Altro", totale: 0, icona: "📦" },
];

export default function Dashboard() {
  const { isLoaded, isSignedIn, user } = useUser();
  const { session } = useSession();
  const [selectedCategory, setSelectedCategory] = useState<{ nome: string, totale: number, icona: string } | null>(null);

  // Global State (Zustand/Context come richiesto)
  const { regime: ctxRegime, expenses: ctxExpenses, removeExpense } = useExpenseContext();

  // Helper per raggruppare spese in tempo reale
  const categorieContextList = [
    { nome: "Alimenti", icona: "🛒" },
    { nome: "Ristoranti", icona: "🍽️" },
    { nome: "Salute", icona: "💊" },
    { nome: "Lavoro", icona: "💼" },
    { nome: "Cancelleria", icona: "📎" },
    { nome: "Software", icona: "💻" },
    { nome: "Telefonia", icona: "📱" },
    { nome: "Auto/Trasporti", icona: "🚗" },
    { nome: "Carburante", icona: "⛽" },
    { nome: "Viaggi", icona: "🚆" },
    { nome: "Spese Clienti", icona: "🤝" },
    { nome: "Rappresentanza", icona: "🍾" },
    { nome: "Tasse", icona: "🏛️" },
    { nome: "Senza Tasse", icona: "🆓" },
    { nome: "Utenze", icona: "💡" },
    { nome: "Affitto", icona: "🏠" },
    { nome: "Formazione", icona: "📚" },
    { nome: "Abbigliamento", icona: "⚖️" },
    { nome: "Imprevisti", icona: "⚠️" },
    { nome: "Altro", icona: "📦" },
  ];

  const ctxGrouped = categorieContextList.map(cat => {
    const transazioniCat = ctxExpenses.filter(e => e.category === cat.nome);
    const totale = transazioniCat.reduce((acc, curr) => acc + curr.amount, 0);
    return { ...cat, totale, transazioni: transazioniCat };
  });

  const getSupabase = useCallback(() => {
    return createClient(supabaseUrl, supabaseKey, {
      global: {
        fetch: async (url, options = {}) => {
          let clerkToken;
          try {
            clerkToken = await session?.getToken({ template: 'supabase' });
          } catch {
            console.warn("Nessun template 'supabase' trovato in Clerk, uso token default");
            clerkToken = await session?.getToken(); // Fallback
          }
          const headers = new Headers(options?.headers);
          if (clerkToken) headers.set('Authorization', `Bearer ${clerkToken}`);
          return fetch(url, { ...options, headers, cache: 'no-store' });
        },
      },
    });
  }, [session]);

  // Dati Dinamici
  const [entrateMensili, setEntrateMensili] = useState(0);
  const [usciteMensili, setUsciteMensili] = useState(0);
  const [tasseMensiliAccantonate, setTasseMensiliAccantonate] = useState(0);
  const [cassaMaturataMensile, setCassaMaturataMensile] = useState(0);
  const [ritenuteMensili, setRitenuteMensili] = useState(0);
  const [categorieSpesa, setCategorieSpesa] = useState(categorieIniziali);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [transazioniMese, setTransazioniMese] = useState<any[]>([]);
  const [limiteRistorantiInfo, setLimiteRistorantiInfo] = useState<{ limite: number; speso: number; percentuale: number; superato: boolean } | null>(null);
  const [regimeCorrente, setRegimeCorrente] = useState<string | null>(null);

  const [sogliaFaccina, setSogliaFaccina] = useState(40);
  const [showGuida, setShowGuida] = useState(false);
  const [showAnnualModal, setShowAnnualModal] = useState(false);

  // Rimosso useEffect anticipato

  const caricaDatiMensili = useCallback(async () => {
    const today = new Date();
    const startOfMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`;

    try {
      const supabase = getSupabase();

      // 0. Carica Profilo Utente (Regime, Faccina, Irpef) via Server Action
      const profiloResult = await getProfiloAction();
      const profile = profiloResult.data;

      let currentScaglione = 23;
      if (profile) {
        if (profile.sad_face_threshold) setSogliaFaccina(profile.sad_face_threshold);
        if (profile.expected_irpef_bracket) {
          currentScaglione = parseInt(profile.expected_irpef_bracket);
        }
      }

      // 1. Carica le Cause
      const { data: cause, error: errCause } = await supabase
        .from('cause')
        .select('*')
        .eq('user_id', user?.id)
        .gte('data_sentenza', startOfMonth);

      if (errCause) {
        console.error("Errore fetch cause mensili: ", errCause.message);
      }

      let totEntrate = 0;
      let totTasseAccantonate = 0;

      if (cause) {
        cause.forEach(c => {
          const importo = Number(c.compenso_lordo || 0);
          totEntrate += importo;
        });
      }

      // 2. Carica le Uscite (Transazioni)
      const { data: uscite, error: errUscite } = await supabase
        .from('transazioni')
        .select('id, importo, categoria, descrizione, data_transazione, created_at, importo_deducibile')
        .eq('user_id', user?.id)
        .eq('tipo', 'uscita')
        .gte('data_transazione', startOfMonth)
        .order('created_at', { ascending: false });

      if (errUscite) {
        console.error("Errore fetch uscite mensili: ", errUscite.message);
        alert("Errore nel caricamento spese: " + errUscite.message);
      }

      let totUsciteLorde = 0;
      let totUsciteDeducibili = 0;
      const nuoveCategorie = categorieIniziali.map(c => ({ ...c, totale: 0 })); // Reset

      if (uscite) {
        setTransazioniMese(uscite);
        uscite.forEach(u => {
          const importoNumerico = Number(u.importo);
          totUsciteLorde += importoNumerico;
          // Usa importo_deducibile se presente (post-aggiornamento), altrimenti usa il lordo
          totUsciteDeducibili += Number(u.importo_deducibile ?? importoNumerico);

          const catIndex = nuoveCategorie.findIndex(c => c.nome === u.categoria);
          if (catIndex !== -1) {
            nuoveCategorie[catIndex].totale += importoNumerico;
          } else {
            nuoveCategorie[nuoveCategorie.length - 1].totale += importoNumerico; // 'Altro'
          }
        });
      }

      // 3. Determinazione Regime Attuale
      let isRegimeOrdinario = false;
      if (profile && profile.regime_fiscale === "ordinario") isRegimeOrdinario = true;
      else if (localStorage.getItem("regime_fiscale_generale") === "ordinario") isRegimeOrdinario = true;

      // 4. Calcolo Finanziario Combinato aggregato
      let lordoIncassato = 0;
      let ordTotCpa = 0;
      let ordTotIva = 0;
      let ordTotRitenuta = 0;

      if (cause) {
        cause.forEach(c => {
          // Compenso + SpeseGenerali
          const compensoPuro = Number(c.compenso_base || c.compenso_lordo || 0);
          const speseGenerali = compensoPuro * 0.15;
          const imponibileLordo = compensoPuro + speseGenerali;

          lordoIncassato += imponibileLordo;
          ordTotCpa += c.cpa_4 ? Number(c.cpa_4) : imponibileLordo * 0.04;
          ordTotIva += c.iva_22 ? Number(c.iva_22) : (imponibileLordo + (c.cpa_4 ? Number(c.cpa_4) : imponibileLordo * 0.04)) * 0.22;
          ordTotRitenuta += c.ritenuta_20 ? Number(c.ritenuta_20) : imponibileLordo * 0.20;
        });
      }

      // 5. Calcolo Totale Spese Deducibili REALI (iterando sulle uscite)
      // Manteniamo rigoroso il vincolo: nessun mock, solo transazioni dal DB.
      let totaleSpeseDeducibili = 0;

      if (uscite) {
        uscite.forEach(u => {
          let rate = 0;
          switch (u.categoria) {
            case "Lavoro": case "Cancelleria": case "Software": case "Spese Clienti": case "Rappresentanza": case "Formazione": case "Abbigliamento":
              rate = 1.0; break;
            case "Telefonia":
              rate = 0.80; break;
            case "Ristoranti": case "Ristoranti / Trasferte":
              rate = 0.75; break;
            case "Utenze": case "Affitto":
              rate = 0.50; break;
            case "Auto/Trasporti": case "Carburante": case "Viaggi":
              rate = 0.20; break;
            case "Tasse":
              rate = 1.0; break;
          }
          totaleSpeseDeducibili += (Number(u.importo) * rate);
        });
      }

      // 6. Logica Bivio Regime e Calcolo Tasse Aggregato
      totTasseAccantonate = 0;
      let totRitenute = ordTotRitenuta;
      let totCassaMaturata = 0;

      const CASSA_ALIQUOTA_BASE = 0.17;
      const CASSA_ALIQUOTA_ECCEDENZA = 0.03;
      const CASSA_TETTO = 135000;
      const CASSA_MATERNITA_MENSILE = 100 / 12; // Quota fissa mensilizzata

      if (lordoIncassato > 0) {
        if (!isRegimeOrdinario) {
          // --- FORFETTARIO ---
          // L'Imponibile Fiscale è uguale al Lordo Incassato moltiplicato per 0.78
          const imponibileFiscale = lordoIncassato * 0.78;
          
          let cassaForense = 0;
          if (imponibileFiscale <= CASSA_TETTO) {
            cassaForense = imponibileFiscale * CASSA_ALIQUOTA_BASE;
          } else {
            cassaForense = (CASSA_TETTO * CASSA_ALIQUOTA_BASE) + ((imponibileFiscale - CASSA_TETTO) * CASSA_ALIQUOTA_ECCEDENZA);
          }
          cassaForense += CASSA_MATERNITA_MENSILE; // Aggiunta maternità
          totCassaMaturata = cassaForense;

          const baseImposta = Math.max(0, imponibileFiscale - cassaForense);
          
          // Prendi la % forfettario dal profilo (default 15%)
          const aliquotaSostitutiva = (profile && profile.regime_fiscale === "forfettario_5") ? 0.05 : 0.15;
          const impostaSostitutiva = baseImposta * aliquotaSostitutiva;

          totTasseAccantonate = ordTotCpa + cassaForense + impostaSostitutiva;

        } else {
          // --- ORDINARIO ---
          // Imponibile Fiscale = (Lordo Incassato - Totale Spese Deducibili)
          const imponibileFiscale = Math.max(0, lordoIncassato - totaleSpeseDeducibili);

          let cassaForense = 0;
          if (imponibileFiscale <= CASSA_TETTO) {
            cassaForense = imponibileFiscale * CASSA_ALIQUOTA_BASE;
          } else {
            cassaForense = (CASSA_TETTO * CASSA_ALIQUOTA_BASE) + ((imponibileFiscale - CASSA_TETTO) * CASSA_ALIQUOTA_ECCEDENZA);
          }
          cassaForense += CASSA_MATERNITA_MENSILE; // Aggiunta maternità
          totCassaMaturata = cassaForense;
          
          // L'IRPEF si applica sull'imponibile al netto della cassa forense
          const baseIrpef = Math.max(0, imponibileFiscale - cassaForense);
          
          let irpefLorda = 0.0;
          if (baseIrpef > 0) {
            const primo_scaglione = Math.min(baseIrpef, 28000);
            irpefLorda += primo_scaglione * 0.23;
            
            if (baseIrpef > 28000) {
              const secondo_scaglione = Math.min(baseIrpef - 28000, 22000);
              irpefLorda += secondo_scaglione * 0.33;
            }
            
            if (baseIrpef > 50000) {
              const terzo_scaglione = baseIrpef - 50000;
              irpefLorda += terzo_scaglione * 0.43;
            }
          }

          const irpefDaVersare = Math.max(0, irpefLorda - ordTotRitenuta);

          // Fondo Tasse Virt. include anche IVA versata in ordinario
          totTasseAccantonate = ordTotCpa + cassaForense + ordTotIva + irpefDaVersare;
        }
      }

      // Applica un safety cap
      if (totTasseAccantonate < 0) totTasseAccantonate = 0;

      // EPICA 4: Calcolo YTD (Year-To-Date) per Limite 2% Ristoranti/Trasferte solo per Ordinario
      setRegimeCorrente(isRegimeOrdinario ? "ordinario" : "forfettario");

      if (isRegimeOrdinario) {
        const startOfYear = `${today.getFullYear()}-01-01`;
        const { data: allCause } = await supabase.from('cause').select('compenso_base, compenso_lordo').eq('user_id', user?.id).gte('data_sentenza', startOfYear);
        let ytdCompensi = 0;
        if (allCause) {
          allCause.forEach(c => ytdCompensi += Number(c.compenso_base || c.compenso_lordo || 0));
        }

        const { data: allUscite } = await supabase.from('transazioni').select('importo, categoria').eq('user_id', user?.id).eq('tipo', 'uscita').gte('data_transazione', startOfYear);
        let ytdRistoranti = 0;
        if (allUscite) {
          allUscite.forEach(u => {
            if (u.categoria === "Ristoranti" || u.categoria === "Ristoranti / Trasferte" || u.categoria?.toLowerCase().includes("ristorant")) {
              ytdRistoranti += Number(u.importo);
            }
          });
        }

        // La legge dice il 2% del totale compensi percepiti
        const limite = ytdCompensi * 0.02;
        const pct = limite > 0 ? (ytdRistoranti / limite) * 100 : 0;
        setLimiteRistorantiInfo({
          limite: limite,
          speso: ytdRistoranti,
          percentuale: pct,
          superato: ytdRistoranti >= limite
        });
      }

      setEntrateMensili(totEntrate);
      setTasseMensiliAccantonate(totTasseAccantonate);
      setCassaMaturataMensile(totCassaMaturata);
      setRitenuteMensili(totRitenute);
      setUsciteMensili(totUsciteLorde);
      setCategorieSpesa(nuoveCategorie);

    } catch (error) {
      console.error("Errore recupero dashboard:", error);
    }
  }, [getSupabase, user]);

  useEffect(() => {
    // Si cerca prima nel local storage come fallback rapido
    const savedSoglia = localStorage.getItem("soglia_faccina");
    if (savedSoglia) setSogliaFaccina(Number(savedSoglia));

    if (isSignedIn && user) {
      caricaDatiMensili();
    }
  }, [isSignedIn, user, caricaDatiMensili]);

  const handleDeleteTransazione = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const confirmed = window.confirm("Sei sicuro di voler eliminare questa spesa?");
    if (!confirmed) return;

    try {
      const supabase = getSupabase();
      const { error } = await supabase
        .from('transazioni')
        .delete()
        .eq('id', id)
        .eq('user_id', user?.id);

      if (error) throw error;

      await caricaDatiMensili();
      // Removed setSelectedCategory(null) so the modal dynamically updates and stays open
    } catch (err: unknown) {
      console.error(err);
      const msg = err instanceof Error ? err.message : String(err);
      alert("Errore nell&apos;eliminazione: " + msg);
    }
  };

  // === CALCOLI GRAFICI DASHBOARD ===
  // Per Ordinario: 4 spicchi (Ritenute, Fondo Tasse Virt, Spese Affrontate, Netto Pulito)
  // Per Forfettario: 3 spicchi (Fondo Tasse Virt, Spese Affrontate, Netto Pulito)

  const isOrdinario = regimeCorrente === "ordinario";
  const speseAffrontateTotali = usciteMensili; // Cash-out reale (importi lordi dal DB)

  let nettoPulito: number;

  if (isOrdinario) {
    // BonificoIncassato = VolumeAffariLordo - Ritenuta
    const bonificoIncassato = entrateMensili - ritenuteMensili;
    // Netto = Bonifico - Fondo Tasse - Spese Affrontate
    nettoPulito = bonificoIncassato - tasseMensiliAccantonate - speseAffrontateTotali;
  } else {
    // Forfettario: Netto = Entrate - Fondo Tasse - Spese
    nettoPulito = entrateMensili - tasseMensiliAccantonate - speseAffrontateTotali;
  }

  const nettoPuroGrafico = Math.max(0.1, nettoPulito);

  // Percentuale allarme su Uscite rispetto alle Entrate
  const entrateVerificabili = entrateMensili > 0 ? entrateMensili : 1;
  const uscitePercentuale = (usciteMensili / entrateVerificabili) * 100;

  const statusIcon = uscitePercentuale > sogliaFaccina
    ? <XCircle className="w-6 h-6 text-red-500" />
    : <CheckCircle2 className="w-6 h-6 text-green-500" />;

  // Grafico a torta
  const dataMensile = isOrdinario
    ? {
        // ORDINARIO: 4 spicchi
        labels: ['Netto Pulito', 'Fondo Tasse Virt.', 'Spese Affrontate', 'Ritenute già pagate'],
        datasets: [{
          data: [
            nettoPuroGrafico,
            tasseMensiliAccantonate > 0 ? tasseMensiliAccantonate : 0.1,
            speseAffrontateTotali > 0 ? speseAffrontateTotali : 0.1,
            ritenuteMensili > 0 ? ritenuteMensili : 0.1
          ],
          backgroundColor: (entrateMensili === 0)
            ? ['#e5e5ea', '#e5e5ea', '#e5e5ea', '#e5e5ea']
            : ['#34c759', '#ff9f0a', '#ff3b30', '#a78bfa'],
          borderWidth: 0,
        }],
      }
    : {
        // FORFETTARIO: 3 spicchi
        labels: ['Netto Pulito', 'Fondo Tasse Virt.', 'Spese Affrontate'],
        datasets: [{
          data: [
            nettoPuroGrafico,
            tasseMensiliAccantonate > 0 ? tasseMensiliAccantonate : 0.1,
            speseAffrontateTotali > 0 ? speseAffrontateTotali : 0.1
          ],
          backgroundColor: (entrateMensili === 0 && speseAffrontateTotali === 0)
            ? ['#e5e5ea', '#e5e5ea', '#e5e5ea']
            : ['#34c759', '#ff9f0a', '#ff3b30'],
          borderWidth: 0,
        }],
      };

  // La torta annuale per ora la lasciamo vuota/placeholder fino al prossimo upgrade
  const dataAnnuale = {
    labels: ['Entrate Nette', 'Uscite'],
    datasets: [
      {
        data: [0.1, 0.1],
        backgroundColor: ['rgba(229, 229, 234, 0.8)', 'rgba(229, 229, 234, 0.8)'],
        borderWidth: 0,
      },
    ],
  };

  if (!isLoaded || !isSignedIn) {
    return null; // O caricamento
  }

  // Filtra transazioni per la modale se aperta
  const transazioniDellaCategoria = selectedCategory
    ? transazioniMese.filter(t => t.categoria === selectedCategory.nome)
    : [];

  return (
    <div className="pb-20">
      <div className="flex-row-between" style={{ marginBottom: "1.5rem" }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
              Ciao, {user?.firstName || 'Avvocato'}! {statusIcon}
            </h2>
            <button
              onClick={() => setShowGuida(true)}
              style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', padding: 0 }}
              title="Guida Fiscale e Tutorial"
            >
              📘
            </button>
          </div>
          <p style={{ color: "var(--foreground)", opacity: 0.6, fontSize: "0.9rem", marginTop: "-4px" }}>
            Mese Corrente
          </p>
        </div>

        {/* Torta Annuale (Piccola in alto a dx) */}
        <div 
          className="md:hidden cursor-pointer transition-transform hover:scale-105" 
          style={{ width: "80px", height: "80px" }}
          onClick={() => setShowAnnualModal(true)}
          title="Vedi Analisi Annuale"
        >
          <Pie data={dataAnnuale} options={{ plugins: { legend: { display: false } } }} />
          <p className="text-[10px] text-center text-blue-500 mt-1 font-medium">Vedi Anno</p>
        </div>
      </div>

      {/* Grid Superiore: Torte e Info Principali */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-6">

        {/* Torta Mensile (Grande Centrale) */}
        <div className="ios-card md:col-span-2 lg:col-span-1" style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          <h3>Bilancio Mensile</h3>

          <div className="chart-container-large" style={{ margin: "1rem 0" }}>
            <Pie
              data={dataMensile}
              options={{
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                  legend: { position: "bottom", labels: { font: { size: 14 } } }
                }
              }}
            />
          </div>

          <div className="flex-row-between" style={{ width: "100%", marginTop: "1rem", flexWrap: "wrap", justifyContent: "space-around" }}>
            <div style={{ textAlign: "center", marginBottom: "0.5rem" }}>
              <span style={{ fontSize: "0.8rem", opacity: 0.7 }}>In Tasca</span>
              <div style={{ fontSize: "1.2rem", fontWeight: "bold", color: "var(--success)" }}>€{nettoPulito.toFixed(2)}</div>
            </div>
            <div style={{ textAlign: "center", marginBottom: "0.5rem" }}>
              <span style={{ fontSize: "0.8rem", opacity: 0.7 }}>Lordo Inc.</span>
              <div style={{ fontSize: "1.2rem", fontWeight: "bold", color: "var(--foreground)" }}>€{entrateMensili.toFixed(2)}</div>
            </div>
            <div style={{ textAlign: "center", marginBottom: "0.5rem" }}>
              <span style={{ fontSize: "0.8rem", opacity: 0.7 }}>Spese Voc.</span>
              <div style={{ fontSize: "1.2rem", fontWeight: "bold", color: "var(--destructive)" }}>€{usciteMensili.toFixed(2)}</div>
            </div>
          </div>
          <div style={{ width: "100%", textAlign: "center", marginTop: "0.5rem", borderTop: "1px solid var(--border)", paddingTop: "0.5rem" }}>
            <span style={{ fontSize: "0.8rem", opacity: 0.7, marginRight: "10px" }}>Fondo Tasse Virt.:</span>
            <span style={{ fontSize: "1rem", fontWeight: "bold", color: "#ff9f0a" }}>€{tasseMensiliAccantonate.toFixed(2)}</span>
            {isOrdinario && ritenuteMensili > 0 && (
              <>
                <br/>
                <span style={{ fontSize: "0.75rem", opacity: 0.6, marginRight: "6px" }}>Ritenute già pagate:</span>
                <span style={{ fontSize: "0.9rem", fontWeight: "bold", color: "#a78bfa" }}>€{ritenuteMensili.toFixed(2)}</span>
              </>
            )}
          </div>
        </div>

        {/* Card 2: Riepilogo Annuale MTD visualizzata solo su desktop per bilanciare */}
        <div 
          className="ios-card hidden md:flex flex-col justify-between hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer"
          onClick={() => setShowAnnualModal(true)}
        >
          <div>
            <h3 className="mb-4">Riepilogo YTD (Anno)</h3>
            <div className="chart-container-small mx-auto mb-4">
              <Pie data={dataAnnuale} options={{ plugins: { legend: { display: false } } }} />
            </div>
          </div>

          <div className="space-y-3 border-t border-black/10 dark:border-white/10 pt-4 mt-auto">
            <p className="text-sm opacity-70 text-center text-blue-500 font-medium">Clicca per l'analisi mese per mese</p>
          </div>
        </div>

        <div className="col-span-1 md:col-span-2 lg:col-span-1">
          <AiAdvisor financialData={{
            entrate: entrateMensili,
            uscite: usciteMensili,
            tasse: tasseMensiliAccantonate,
            regime: regimeCorrente || "forfettario"
          }} />
        </div>

      </div>

      {/* ALERT GAMIFICATION FISCALE (EPICA 4) */}
      {regimeCorrente === "ordinario" && limiteRistorantiInfo && limiteRistorantiInfo.limite > 0 && limiteRistorantiInfo.percentuale >= 75 && (
        <div className="ios-card" style={{ marginTop: "1rem", backgroundColor: limiteRistorantiInfo.superato ? "rgba(255, 59, 48, 0.1)" : "rgba(255, 149, 0, 0.1)", border: `1px solid ${limiteRistorantiInfo.superato ? "var(--destructive)" : "#ff9f0a"}`, animation: "fadeIn 0.5s" }}>
          <div style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
            <div style={{ fontSize: "2rem" }}>{limiteRistorantiInfo.superato ? "🛑" : "⚠️"}</div>
            <div>
              <h4 style={{ margin: "0 0 4px 0", color: limiteRistorantiInfo.superato ? "var(--destructive)" : "#cc7e00" }}>
                {limiteRistorantiInfo.superato ? "Limite Ristoranti Superato" : "Attenzione: Limite Ristoranti Vicino"}
              </h4>
              <p style={{ fontSize: "0.85rem", margin: 0, opacity: 0.9 }}>
                {limiteRistorantiInfo.superato
                  ? `Hai superato il limite di legge del 2% annuo per dedurre i pasti (Speso: €${limiteRistorantiInfo.speso.toFixed(2)} / Limite: €${limiteRistorantiInfo.limite.toFixed(2)}). Le prossime fatture al ristorante non abbatteranno più le tue tasse.`
                  : `Sei al ${limiteRistorantiInfo.percentuale.toFixed(0)}% del limite annuo (2% dei compensi) per ristoranti e hotel. (Speso: €${limiteRistorantiInfo.speso.toFixed(2)} / Limite: €${limiteRistorantiInfo.limite.toFixed(2)}).`
                }
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ALERT CASSA FORENSE MINIMALE */}
      {cassaMaturataMensile > 0 && cassaMaturataMensile < 3600 && (
        <div className="ios-card" style={{ marginTop: "1rem", backgroundColor: "rgba(255, 149, 0, 0.1)", border: "1px solid #ff9f0a", animation: "fadeIn 0.5s" }}>
          <div style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
            <div style={{ fontSize: "2rem" }}>⚠️</div>
            <div>
              <h4 style={{ margin: "0 0 4px 0", color: "#cc7e00" }}>
                Target Cassa Forense
              </h4>
              <p style={{ fontSize: "0.85rem", margin: 0, opacity: 0.9 }}>
                Hai maturato <strong>€{cassaMaturataMensile.toFixed(2)}</strong> di contributi. La Cassa richiede un versamento minimo annuo di 3.600€. Mancano <strong>€{(3600 - cassaMaturataMensile).toFixed(2)}</strong> per coprire la quota fissa.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Grid Inferiore: Categorie di Spesa (GLOBAL STATE CONTEXT) */}
      <div className="mt-8 mb-4 flex justify-between items-end">
        <div>
          <h2 style={{ margin: 0, display: "flex", alignItems: "center", gap: "8px" }}>
            Spese In Tempo Reale <span className="bg-blue-500/20 text-blue-500 text-xs px-2 py-1 rounded-full">{ctxRegime}</span>
          </h2>
          <p style={{ fontSize: "0.9rem", opacity: 0.7, margin: 0 }}>
            {ctxRegime === "forfettario" ? "⚠️ Statistiche visive (Non sottratte ai ricavi)" : "Deducibili dall'imponibile"}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
        {categorieSpesa.map((cat, idx) => (
          <div
            key={idx}
            className="ios-card hover:bg-white/5 transition-colors flex flex-col justify-between"
            style={{ padding: "1.25rem", cursor: "pointer", height: "120px" }}
            onClick={() => setSelectedCategory(cat)}
          >
            <div style={{ fontSize: "2rem", marginBottom: "0.25rem" }}>{cat.icona}</div>
            <div>
              <div style={{ fontSize: "1rem", fontWeight: "600", color: "var(--foreground)" }}>{cat.nome}</div>
              <div style={{ fontSize: "1.1rem", opacity: 0.8, color: cat.totale > 0 ? "var(--destructive)" : "inherit" }}>
                €{cat.totale.toFixed(2)}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Bottom Sheet Modale Spese Context */}
      {selectedCategory && (
        <div className="bottom-sheet-overlay" onClick={() => setSelectedCategory(null)} style={{ zIndex: 1000 }}>
          <div className="bottom-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="bottom-sheet-handle"></div>
            <button className="bottom-sheet-close" onClick={() => setSelectedCategory(null)}>&times;</button>

            <div style={{ textAlign: "center", marginTop: "1rem", marginBottom: "1rem" }}>
              <div style={{ fontSize: "4rem", marginBottom: "1rem" }}>{selectedCategory.icona}</div>
              <h2>{selectedCategory.nome}</h2>
              <p style={{ fontSize: "1.5rem", fontWeight: "bold", color: "var(--primary)" }}>
                Totale Categoria: €{transazioniDellaCategoria.reduce((acc, curr) => acc + Number(curr.importo), 0).toFixed(2)}
              </p>
            </div>

            <div style={{ padding: "0 1rem", maxHeight: "40vh", overflowY: "auto" }}>
              {transazioniDellaCategoria.length === 0 ? (
                <div style={{ textAlign: "center", opacity: 0.5, padding: "2rem" }}>
                  Nessuna transazione in questa categoria.
                </div>
              ) : (
                transazioniDellaCategoria.map((t: any) => (
                  <div key={t.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderBottom: "1px solid var(--border)" }}>
                    <div style={{ textAlign: "left" }}>
                      <div style={{ fontWeight: "600", color: "var(--foreground)", fontSize: "1rem" }}>{t.descrizione || t.categoria}</div>
                      <div style={{ fontSize: "0.8rem", opacity: 0.5 }}>{new Date(t.data_transazione || t.created_at).toLocaleDateString()}</div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                      <span style={{ fontWeight: "bold", color: "var(--destructive)", fontSize: "1.1rem" }}>€{Number(t.importo).toFixed(2)}</span>
                      <button
                        onClick={(e) => handleDeleteTransazione(t.id, e)}
                        style={{ background: "none", border: "none", color: "var(--destructive)", padding: "4px", cursor: "pointer", opacity: 0.8, transition: "opacity 0.2s" }}
                        onMouseEnter={(e) => e.currentTarget.style.opacity = "1"}
                        onMouseLeave={(e) => e.currentTarget.style.opacity = "0.8"}
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div style={{ textAlign: "center" }}>
              <button
                className="ios-btn-large"
                style={{ marginTop: "2rem", width: "100%" }}
                onClick={() => setSelectedCategory(null)}
              >
                Chiudi
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modale Guida e Tutorial App */}
      {showGuida && (
        <div className="bottom-sheet-overlay" onClick={() => setShowGuida(false)} style={{ zIndex: 1000 }}>
          <div className="bottom-sheet" onClick={(e) => e.stopPropagation()} style={{ height: '85vh', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
            <div className="bottom-sheet-handle"></div>
            <button className="bottom-sheet-close" onClick={() => setShowGuida(false)}>&times;</button>

            <div style={{ padding: "0 1rem 2rem 1rem", overflowY: "auto", flex: 1 }}>
              <h2 style={{ marginBottom: "1.5rem", textAlign: "center", fontSize: "1.5rem" }}>📘 Guida & Tutorial</h2>

              <div className="ios-card" style={{ marginBottom: "1rem" }}>
                <h3 style={{ color: "var(--primary)", marginBottom: "0.5rem" }}>Il Nuovo Motore Fiscale</h3>
                <div style={{ marginTop: "1rem" }}>
                  <p style={{ fontSize: "0.9rem", color: "var(--foreground)", opacity: 0.8, marginBottom: "1rem" }}>
                    Il calcolo si adatta automaticamente al tuo regime: <strong>Forfettario</strong> (imponibile fisso al 78% del Lordo) o <strong>Ordinario</strong> (deduzione analitica reale delle spese in base alle categorie sottostanti).
                  </p>
                </div>
                <p style={{ fontSize: "0.9rem", lineHeight: "1.5", opacity: 0.9, marginBottom: "0.5rem" }}>
                  <strong>1. Badge in Tempo Reale:</strong> Inserendo una spesa manualmente o scansionando uno scontrino, vedrai comparire un avviso in tempo reale con l&apos;esatto importo deducibile (es: amount * deductibilityRate) calcolato matematicamente al volo.
                </p>
                <p style={{ fontSize: "0.9rem", lineHeight: "1.5", opacity: 0.9, marginBottom: "0.5rem" }}>
                  <strong>2. Tasse Abbattute in Diretta (Ordinario):</strong> La Dashboard &quot;sottrae&quot; automaticamente il totale delle spese legalmente deducibili dal tuo imponibile. Noterai il tuo <em>Fondo Tasse Virt.</em> abbassarsi in tempo reale all&apos;inserimento di ogni scontrino valido!
                </p>
                <li>
                  <strong>3. Tieni d&apos;occhio l&apos;Indicatore di Spesa:</strong> L&apos;icona in alto (Verde/Rossa) valuta la tua spesa globale per frenare il consumismo. Modificabile nelle impostazioni.
                </li>
                <p style={{ fontSize: "0.9rem", lineHeight: "1.5", opacity: 0.9 }}>
                  <strong>4. Gamification Ristoranti:</strong> La legge italiana limita le spese per Ristoranti e Hotel al 2% dei compensi annui (YTD). Se ti avvicini o sfori questo tetto, la UI rivelerà un banner di allerta arancione/rosso sotto il grafico mensile per dirti di non dedurre più!
                </p>
              </div>

              <div className="ios-card" style={{ marginBottom: "2rem" }}>
                <h3 style={{ color: "var(--primary)", marginBottom: "0.5rem" }}>Motore delle Deduzioni (Regime Ordinario)</h3>
                <p style={{ fontSize: "0.85rem", opacity: 0.8, marginBottom: "1rem", background: "rgba(255,59,48,0.1)", padding: "10px", borderRadius: "8px", color: "var(--destructive)" }}>
                  <strong>Nota per i Forfettari:</strong> I bonus deducibilità spiegati sotto valgono SOLO per il <strong>Regime Ordinario</strong>. I forfettari hanno costi scaricati automaticamente al 15% per legge (Coefficiente di Redditività).
                </p>
                <div style={{ fontSize: "0.85rem", lineHeight: "1.6", opacity: 0.9 }}>
                  <div style={{ marginBottom: "12px" }}>
                    <span style={{ color: "var(--emerald-500)", fontWeight: "bold" }}>🟢 DEDUCIBILI AL 100% (Senza limiti)</span>
                    <ul style={{ paddingLeft: "1.2rem", marginTop: "4px" }}>
                      <li><strong>Lavoro & Cancelleria:</strong> Computer, tablet, stampanti, carta, toner, penne.</li>
                      <li><strong>Software:</strong> PEC, firma digitale, abbonamenti cloud (StateraLex 😍).</li>
                      <li><strong>Spese Anticipate:</strong> Rimborsi spese in nome/conto del cliente debitamente fatturati.</li>
                      <li><strong>Abbigliamento (Toga):</strong> Dedicato solo alla Toga per avvocati.</li>
                    </ul>
                  </div>

                  <div style={{ marginBottom: "12px" }}>
                    <span style={{ color: "#ffcc00", fontWeight: "bold" }}>🟡 DEDUCIBILI AL 100% (Con tetti massimi)</span>
                    <ul style={{ paddingLeft: "1.2rem", marginTop: "4px" }}>
                      <li><strong>Formazione e Master:</strong> Master, Corsi, Convegni deducibili al 100% fino a un massimo di 10.000€ l'anno.</li>
                      <li><strong>Spese di Rappresentanza:</strong> Omaggi ai clienti e pubbliche relazioni, nel limite dell'1% dei ricavi.</li>
                    </ul>
                  </div>

                  <div style={{ marginBottom: "12px" }}>
                    <span style={{ color: "#007AFF", fontWeight: "bold" }}>🔵 DEDUCIBILI ALL'80%</span>
                    <ul style={{ paddingLeft: "1.2rem", marginTop: "4px" }}>
                      <li><strong>Telefonia & Internet:</strong> Smartphone, bollette telefoniche e traffico dati.</li>
                    </ul>
                  </div>

                  <div style={{ marginBottom: "12px" }}>
                    <span style={{ color: "#ff9f0a", fontWeight: "bold" }}>🟠 DEDUCIBILI AL 75%</span>
                    <ul style={{ paddingLeft: "1.2rem", marginTop: "4px" }}>
                      <li><strong>Ristoranti & Trasferte:</strong> Pranzi/cene di lavoro. Il limite globale annuo non può superare il 2% dei compensi totali incassati.</li>
                    </ul>
                  </div>

                  <div style={{ marginBottom: "12px" }}>
                    <span style={{ color: "#bf5af2", fontWeight: "bold" }}>🟣 DEDUCIBILI AL 50%</span>
                    <ul style={{ paddingLeft: "1.2rem", marginTop: "4px" }}>
                      <li><strong>Affitto & Utenze (Promiscuo):</strong> Affitto, luce, gas, condominio, valevole SE non possiedi un altro studio esclusivo nello stesso Comune.</li>
                    </ul>
                  </div>

                  <div style={{ marginBottom: "12px" }}>
                    <span style={{ color: "var(--destructive)", fontWeight: "bold" }}>🔴 DEDUCIBILI AL 20%</span>
                    <ul style={{ paddingLeft: "1.2rem", marginTop: "4px" }}>
                      <li><strong>Auto & Trasporti/Viaggi:</strong> Carburante, assicurazione auto, pedaggi, manutenzioni limitate ai tetti fiscali (max 18.075,99€ calcolo auto).</li>
                    </ul>
                  </div>

                  <div style={{ marginBottom: "12px", background: "white", padding: "10px", borderRadius: "8px", color: "black" }}>
                    <span style={{ color: "black", fontWeight: "800", display: "flex", alignItems: "center", gap: "6px" }}>🏛️ CASSA FORENSE (CONTRIBUTO SOGGETTIVO)</span>
                    <p style={{ marginTop: "4px", marginBottom: 0, fontSize: "0.9rem" }}>
                       La Cassa Forense viene calcolata in modo progressivo sul Reddito Netto: <strong>17%</strong> fino al tetto di 135.000€, e <strong>3%</strong> sull'eccedenza. Ai fini IRPEF è un onere deducibile (abbassa la base imponibile). Esiste un minimale fisso annuo di circa 3.600€ che occorre versare indipendentemente dai ricavi, indicato nell'apposito Alert quando non si raggiunge tale Target.
                    </p>
                  </div>

                </div>
                <p style={{ fontSize: "0.75rem", color: "var(--destructive)", marginTop: "1rem", opacity: 0.8 }}>
                  <em>Disclaimer: StateraLex applica le aliquote presunte per un normale Libero Professionista. Fai sempre validare l'inerenza della spesa dal tuo Medico o Commercialista (art 54 TUIR).</em>
                </p>
              </div>

              <button
                className="ios-btn-large"
                onClick={() => setShowGuida(false)}
                style={{ width: "100%", marginTop: "1rem" }}
              >
                Ho Capito
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modale Dashboard Annuale (Mese per Mese) */}
      {showAnnualModal && (
        <AnnualDashboardModal 
          onClose={() => setShowAnnualModal(false)} 
          regime={regimeCorrente || "forfettario"} 
        />
      )}

      {/* Bottone Export Excel Commercialista */}
      <div style={{ marginTop: "3rem", marginBottom: "1rem" }}>
        <ExportCommercialistaButton />
      </div>

      {/* Footer Legale Interno (Beta) */}
      <div style={{ marginTop: "4rem", paddingTop: "2rem", borderTop: "1px solid var(--border)", textAlign: "center" }}>
        <p style={{ fontSize: "0.75rem", opacity: 0.6, maxWidth: "800px", margin: "0 auto", lineHeight: "1.6" }}>
          <strong>Versione Beta Privata.</strong> Questo gestionale è fornito allo stato attuale come test non a fini commerciali (Senza Partita IVA).
          I calcoli fiscali visualizzati in questa Dashboard (Cassa Forense, IRPEF, Imposta Sostitutiva) hanno puramente valore di simulazione matematica e non costituiscono parere professionale né dato certo per le dichiarazioni fiscali obbligatorie.
          <br /><br />
          <strong>Privacy:</strong> Nessun dato biometrico o immagine di spesa viene trasmesso esternamente (elaborazione OCR su dispositivo). Vengono impiegati esclusivamente cookie tecnici per la validazione della sessione.
        </p>
      </div>

    </div>
  );
}
