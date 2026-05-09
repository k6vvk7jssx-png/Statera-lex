"use client";

import { useState, useEffect, useCallback } from "react";
import { Pie } from "react-chartjs-2";
import { useUser, useSession } from "@clerk/nextjs";
import { createClient } from "@supabase/supabase-js";
import { Loader2, X } from "lucide-react";

interface AnnualDashboardModalProps {
  onClose: () => void;
  regime: string;
}

const mesi = ["Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno", "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"];

export default function AnnualDashboardModal({ onClose, regime }: AnnualDashboardModalProps) {
  const { user } = useUser();
  const { session } = useSession();
  const [selectedMonth, setSelectedMonth] = useState<number | null>(new Date().getMonth());
  const [loading, setLoading] = useState(false);
  const [monthData, setMonthData] = useState({ entrate: 0, uscite: 0, tasse: 0, netto: 0 });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  const getSupabase = useCallback(() => {
    return createClient(supabaseUrl, supabaseKey, {
      global: {
        fetch: async (url, options = {}) => {
          let clerkToken;
          try {
            clerkToken = await session?.getToken({ template: 'supabase' });
          } catch {
            clerkToken = await session?.getToken(); 
          }
          const headers = new Headers(options?.headers);
          if (clerkToken) headers.set('Authorization', `Bearer ${clerkToken}`);
          return fetch(url, { ...options, headers, cache: 'no-store' });
        },
      },
    });
  }, [session, supabaseUrl, supabaseKey]);

  useEffect(() => {
    if (selectedMonth === null) return;
    
    const fetchMonthData = async () => {
      setLoading(true);
      const year = new Date().getFullYear();
      const monthStr = String(selectedMonth + 1).padStart(2, '0');
      const startOfMonth = `${year}-${monthStr}-01`;
      
      // Calculate end of month
      const endMonthDate = new Date(year, selectedMonth + 1, 0);
      const endOfMonth = `${year}-${monthStr}-${String(endMonthDate.getDate()).padStart(2, '0')}`;

      try {
        const supabase = getSupabase();
        
        // 1. Entrate (Cause)
        const { data: cause } = await supabase
          .from('cause')
          .select('compenso_base, compenso_lordo')
          .eq('user_id', user?.id)
          .gte('data_sentenza', startOfMonth)
          .lte('data_sentenza', endOfMonth);

        let totEntrate = 0;
        let lordoIncassato = 0;
        if (cause) {
          cause.forEach(c => {
            const importo = Number(c.compenso_lordo || 0);
            totEntrate += importo;
            
            const compensoPuro = Number(c.compenso_base || c.compenso_lordo || 0);
            const speseGenerali = compensoPuro * 0.15;
            lordoIncassato += (compensoPuro + speseGenerali);
          });
        }

        // 2. Uscite (Transazioni)
        const { data: uscite } = await supabase
          .from('transazioni')
          .select('importo, importo_deducibile, categoria')
          .eq('user_id', user?.id)
          .eq('tipo', 'uscita')
          .gte('data_transazione', startOfMonth)
          .lte('data_transazione', endOfMonth);

        let totUsciteLorde = 0;
        let totaleSpeseDeducibili = 0;

        if (uscite) {
          uscite.forEach(u => {
            totUsciteLorde += Number(u.importo);
            let rate = 1.0;
            switch (u.categoria) {
              case "Telefonia": rate = 0.80; break;
              case "Ristoranti": case "Ristoranti / Trasferte": rate = 0.75; break;
              case "Utenze": case "Affitto": rate = 0.50; break;
              case "Auto/Trasporti": case "Carburante": case "Viaggi": rate = 0.20; break;
            }
            totaleSpeseDeducibili += (Number(u.importo) * rate);
          });
        }

        // 3. Calcolo Tasse e Netto
        let totTasseAccantonate = 0;
        let nettoPulito = 0;

        if (regime === "forfettario") {
          const imponibileFiscale = lordoIncassato * 0.78;
          let cassaForense = imponibileFiscale * 0.17; 
          cassaForense += 100 / 12; // Maternità mensilizzata
          const baseImposta = Math.max(0, imponibileFiscale - cassaForense);
          const impostaSostitutiva = baseImposta * 0.15; 
          
          totTasseAccantonate = (lordoIncassato * 0.04) + cassaForense + impostaSostitutiva;
          nettoPulito = totEntrate - totTasseAccantonate - totUsciteLorde;
        } else {
          // Ordinario semplificato
          const imponibileFiscale = Math.max(0, lordoIncassato - totaleSpeseDeducibili);
          let cassaForense = imponibileFiscale * 0.17;
          cassaForense += 100 / 12; // Maternità mensilizzata
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
          const ordTotIva = lordoIncassato * 0.22;
          const ritenutaPresunta = lordoIncassato * 0.20;
          const irpefDaVersare = Math.max(0, irpefLorda - ritenutaPresunta);
          
          totTasseAccantonate = (lordoIncassato * 0.04) + cassaForense + ordTotIva + irpefDaVersare;
          const bonificoIncassato = totEntrate - ritenutaPresunta; // meno ritenuta presunta
          nettoPulito = bonificoIncassato - totTasseAccantonate - totUsciteLorde;
        }

        if (totTasseAccantonate < 0) totTasseAccantonate = 0;

        setMonthData({
          entrate: totEntrate,
          uscite: totUsciteLorde,
          tasse: totTasseAccantonate,
          netto: nettoPulito
        });

      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchMonthData();
  }, [selectedMonth, getSupabase, user, regime]);

  const nettoPuroGrafico = Math.max(0.1, monthData.netto);
  const pieData = {
    labels: ['Netto Pulito', 'Fondo Tasse Virt.', 'Spese Affrontate'],
    datasets: [{
      data: [
        nettoPuroGrafico,
        monthData.tasse > 0 ? monthData.tasse : 0.1,
        monthData.uscite > 0 ? monthData.uscite : 0.1
      ],
      backgroundColor: (monthData.entrate === 0 && monthData.uscite === 0)
        ? ['#e5e5ea', '#e5e5ea', '#e5e5ea']
        : ['#34c759', '#ff9f0a', '#ff3b30'],
      borderWidth: 0,
    }],
  };

  return (
    <div className="bottom-sheet-overlay" onClick={onClose} style={{ zIndex: 1000 }}>
      <div className="bottom-sheet" onClick={(e) => e.stopPropagation()} style={{ height: '85vh', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
        <div className="bottom-sheet-handle"></div>
        <button className="bottom-sheet-close" onClick={onClose}><X size={24} /></button>

        <div style={{ padding: "1rem", overflowY: "auto", flex: 1 }}>
          <h2 style={{ marginBottom: "1rem", textAlign: "center", fontSize: "1.5rem" }}>Analisi Annuale Mensilizzata</h2>
          
          {/* Griglia dei mesi */}
          <div className="grid grid-cols-3 md:grid-cols-4 gap-2 mb-6">
            {mesi.map((m, idx) => (
              <button
                key={idx}
                onClick={() => setSelectedMonth(idx)}
                className={`p-2 rounded-xl text-sm font-medium transition-colors ${selectedMonth === idx ? 'bg-blue-500 text-white' : 'bg-black/5 dark:bg-white/5 hover:bg-black/10'}`}
              >
                {m.substring(0, 3)}
              </button>
            ))}
          </div>

          {/* Dettaglio Mese Selezionato */}
          <div className="ios-card" style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
            <h3 className="mb-4">Bilancio di {mesi[selectedMonth || 0]}</h3>

            {loading ? (
              <div className="flex justify-center items-center h-48">
                <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
              </div>
            ) : (
              <>
                <div className="chart-container-large" style={{ margin: "1rem 0" }}>
                  <Pie
                    data={pieData}
                    options={{
                      responsive: true,
                      maintainAspectRatio: true,
                      plugins: { legend: { position: "bottom", labels: { font: { size: 14 } } } }
                    }}
                  />
                </div>

                <div className="flex-row-between" style={{ width: "100%", marginTop: "1rem", flexWrap: "wrap", justifyContent: "space-around" }}>
                  <div style={{ textAlign: "center", marginBottom: "0.5rem" }}>
                    <span style={{ fontSize: "0.8rem", opacity: 0.7 }}>Netto</span>
                    <div style={{ fontSize: "1.2rem", fontWeight: "bold", color: "var(--success)" }}>€{monthData.netto.toFixed(2)}</div>
                  </div>
                  <div style={{ textAlign: "center", marginBottom: "0.5rem" }}>
                    <span style={{ fontSize: "0.8rem", opacity: 0.7 }}>Lordo Inc.</span>
                    <div style={{ fontSize: "1.2rem", fontWeight: "bold", color: "var(--foreground)" }}>€{monthData.entrate.toFixed(2)}</div>
                  </div>
                  <div style={{ textAlign: "center", marginBottom: "0.5rem" }}>
                    <span style={{ fontSize: "0.8rem", opacity: 0.7 }}>Spese Voc.</span>
                    <div style={{ fontSize: "1.2rem", fontWeight: "bold", color: "var(--destructive)" }}>€{monthData.uscite.toFixed(2)}</div>
                  </div>
                </div>
                <div style={{ width: "100%", textAlign: "center", marginTop: "0.5rem", borderTop: "1px solid var(--border)", paddingTop: "0.5rem" }}>
                  <span style={{ fontSize: "0.8rem", opacity: 0.7, marginRight: "10px" }}>Fondo Tasse Virt.:</span>
                  <span style={{ fontSize: "1rem", fontWeight: "bold", color: "#ff9f0a" }}>€{monthData.tasse.toFixed(2)}</span>
                </div>
              </>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
