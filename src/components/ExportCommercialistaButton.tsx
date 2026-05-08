"use client";

import { useState } from "react";
import * as XLSX from "xlsx";
import { FileSpreadsheet, Download, Loader2 } from "lucide-react";
import { useUser, useSession } from "@clerk/nextjs";
import { createClient } from "@supabase/supabase-js";
import { getProfiloAction } from "@/app/impostazioni/actions";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export default function ExportCommercialistaButton() {
    const [isExporting, setIsExporting] = useState(false);
    const { user } = useUser();
    const { session } = useSession();

    const getSupabase = () => {
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
    };

    const handleExport = async () => {
        if (!user) {
            alert("Utente non autenticato.");
            return;
        }

        setIsExporting(true);

        try {
            const supabase = getSupabase();
            const today = new Date();
            const startOfYear = `${today.getFullYear()}-01-01`;

            // 1. Fetch Regime Fiscale
            const profiloResult = await getProfiloAction();
            const profile = profiloResult.data;
            let isRegimeOrdinario = false;
            let regimeName = "Forfettario";
            
            if (profile && profile.regime_fiscale === "ordinario") {
                isRegimeOrdinario = true;
                regimeName = "Ordinario";
            } else if (localStorage.getItem("regime_fiscale_generale") === "ordinario") {
                isRegimeOrdinario = true;
                regimeName = "Ordinario";
            }

            // 2. Fetch Fatture (Entrate YTD)
            const { data: cause, error: errCause } = await supabase
                .from('cause')
                .select('*')
                .eq('user_id', user.id)
                .gte('data_sentenza', startOfYear)
                .order('data_sentenza', { ascending: true });

            if (errCause) throw errCause;

            // 3. Fetch Spese (Uscite YTD)
            const { data: transazioni, error: errTransazioni } = await supabase
                .from('transazioni')
                .select('*')
                .eq('user_id', user.id)
                .eq('tipo', 'uscita')
                .gte('data_transazione', startOfYear)
                .order('data_transazione', { ascending: true });

            if (errTransazioni) throw errTransazioni;

            // --- FOGLIO 1: FATTURE EMESSE ---
            let totaleIncassato = 0; // Compenso + Spese Generali
            let sumCpa = 0;
            let sumIva = 0;
            let sumRitenute = 0;

            const fattureData = (cause || []).map(c => {
                const dataFattura = c.data_sentenza ? new Date(c.data_sentenza).toLocaleDateString() : "N/D";
                const cliente = c.cliente || c.titolo || "N/D";
                const compenso = Number(c.compenso_base || c.compenso_lordo || 0);
                const speseGenerali = compenso * 0.15;
                const speseArt15 = c.spese_esenti ? Number(c.spese_esenti) : 0;
                const imponibileLordo = compenso + speseGenerali;
                
                totaleIncassato += imponibileLordo;

                const cpa = c.cpa_4 ? Number(c.cpa_4) : imponibileLordo * 0.04;
                const iva = c.iva_22 ? Number(c.iva_22) : (isRegimeOrdinario ? (imponibileLordo + cpa) * 0.22 : 0);
                const totaleLordo = imponibileLordo + cpa + iva + speseArt15;

                const ritenuta = c.ritenuta_20 ? Number(c.ritenuta_20) : (isRegimeOrdinario ? imponibileLordo * 0.20 : 0);
                const nettoIncassato = totaleLordo - ritenuta;

                sumCpa += cpa;
                sumIva += iva;
                sumRitenute += ritenuta;

                return {
                    "Data": dataFattura,
                    "Cliente / Pratica": cliente,
                    "Compenso (€)": compenso.toFixed(2),
                    "Spese Generali (15%) (€)": speseGenerali.toFixed(2),
                    "Spese Art. 15 (€)": speseArt15.toFixed(2),
                    "CPA (€)": cpa.toFixed(2),
                    "IVA (€)": iva.toFixed(2),
                    "Ritenuta d'Acconto (€)": ritenuta.toFixed(2),
                    "Totale Lordo Fattura (€)": totaleLordo.toFixed(2),
                    "Netto Incassato (€)": nettoIncassato.toFixed(2)
                };
            });

            // --- FOGLIO 2: SPESE SOSTENUTE ---
            let totaleSpeseDeducibili = 0;

            const speseData = (transazioni || []).map(t => {
                const dataSpesa = t.data_transazione ? new Date(t.data_transazione).toLocaleDateString() : "N/D";
                const fornitore = t.descrizione || "N/D";
                const categoria = t.categoria || "Altro";
                // L'importo reale immesso
                const importo = Number(t.importo || 0);

                let rate = 0;
                switch (categoria) {
                    case "Lavoro": case "Cancelleria": case "Software": case "Spese Clienti": case "Rappresentanza": case "Formazione": case "Abbigliamento": case "Toga":
                        rate = 1.0; break;
                    case "Telefonia":
                        rate = 0.80; break;
                    // Mappa entrambe le varianti
                    case "Ristoranti": case "Ristoranti / Trasferte":
                        rate = 0.75; break;
                    case "Utenze": case "Affitto":
                        rate = 0.50; break;
                    case "Auto/Trasporti": case "Carburante": case "Viaggi": case "Auto":
                        rate = 0.20; break;
                    case "Tasse":
                        rate = 1.0; break;
                }

                const importoDeducibile = isRegimeOrdinario ? (importo * rate) : 0;
                totaleSpeseDeducibili += importoDeducibile;

                return {
                    "Data": dataSpesa,
                    "Fornitore / Descrizione": fornitore,
                    "Categoria": categoria,
                    "Importo Speso (Lordo IVA) (€)": importo.toFixed(2),
                    "% Deducibilità": isRegimeOrdinario ? `${(rate * 100).toFixed(0)}%` : "N/A",
                    "Importo Deducibile Netto (€)": importoDeducibile.toFixed(2)
                };
            });

            // --- FOGLIO 3: RIEPILOGO FISCALE ---
            let imponibileFiscale = 0;
            if (isRegimeOrdinario) {
                imponibileFiscale = Math.max(0, totaleIncassato - totaleSpeseDeducibili);
            } else {
                imponibileFiscale = totaleIncassato * 0.78;
            }

            const CASSA_ALIQUOTA_BASE = 0.17;
            const CASSA_ALIQUOTA_ECCEDENZA = 0.03;
            const CASSA_TETTO = 135000;
            const CASSA_MATERNITA_ANNUALE = 100;

            let cassaTeorica = 0;
            if (imponibileFiscale <= CASSA_TETTO) {
                cassaTeorica = imponibileFiscale * CASSA_ALIQUOTA_BASE;
            } else {
                cassaTeorica = (CASSA_TETTO * CASSA_ALIQUOTA_BASE) + ((imponibileFiscale - CASSA_TETTO) * CASSA_ALIQUOTA_ECCEDENZA);
            }
            cassaTeorica += CASSA_MATERNITA_ANNUALE;

            const riepilogoData = [
                { "Voce": "Totale Incassato (Compenso + Spese Generali)", "Valore": `€ ${totaleIncassato.toFixed(2)}` },
                { "Voce": "Regime Fiscale Applicato", "Valore": regimeName },
                { "Voce": "Totale Spese Deducibili Applicate", "Valore": isRegimeOrdinario ? `€ ${totaleSpeseDeducibili.toFixed(2)}` : "€ 0.00 (Forfettario)" },
                { "Voce": "Imponibile Fiscale Calcolato", "Valore": `€ ${imponibileFiscale.toFixed(2)}` },
                { "Voce": "Cassa Forense Teorica (Maturata)", "Valore": `€ ${cassaTeorica.toFixed(2)}` },
                { "Voce": "Totale CPA Maturato (4%)", "Valore": `€ ${sumCpa.toFixed(2)}` },
                { "Voce": "Totale IVA Incassata (A Debito)", "Valore": `€ ${sumIva.toFixed(2)}` },
                { "Voce": "Totale Ritenute Subite (Credito IRPEF)", "Valore": `€ ${sumRitenute.toFixed(2)}` },
                { "Voce": "Alert Minimale", "Valore": "Nota: Contributo Soggettivo Minimo di Legge ~3.600€ annui" }
            ];

            // 1. Crea in memoria un nuovo Workbook Excel
            const wb = XLSX.utils.book_new();

            // 2. Converte l'array di oggetti in fogli gestibili
            const wsFatture = fattureData.length > 0 ? XLSX.utils.json_to_sheet(fattureData) : XLSX.utils.json_to_sheet([{"Messaggio": "Nessuna fattura trovata quest'anno"}]);
            const wsSpese = speseData.length > 0 ? XLSX.utils.json_to_sheet(speseData) : XLSX.utils.json_to_sheet([{"Messaggio": "Nessuna spesa trovata quest'anno"}]);
            const wsRiepilogo = XLSX.utils.json_to_sheet(riepilogoData);

            // Larghezze colonne ottimizzate
            wsFatture['!cols'] = [{ wch: 12 }, { wch: 30 }, { wch: 15 }, { wch: 22 }, { wch: 18 }, { wch: 12 }, { wch: 12 }, { wch: 22 }, { wch: 24 }, { wch: 20 }];
            wsSpese['!cols'] = [{ wch: 12 }, { wch: 35 }, { wch: 20 }, { wch: 30 }, { wch: 15 }, { wch: 30 }];
            wsRiepilogo['!cols'] = [{ wch: 60 }, { wch: 30 }];

            // 3. Aggiunge i fogli creati al Workbook con i nomi richiesti
            XLSX.utils.book_append_sheet(wb, wsFatture, "Fatture_Emesse");
            XLSX.utils.book_append_sheet(wb, wsSpese, "Spese_Sostenute");
            XLSX.utils.book_append_sheet(wb, wsRiepilogo, "Riepilogo_Fiscale");

            // 4. Salva il file forzando il download sul browser del cliente
            XLSX.writeFile(wb, `Export_Fiscale_StateraLex.xlsx`);

        } catch (error) {
            console.error("Errore durante l'export in Excel:", error);
            alert("Si è verificato un errore durante la generazione dell'Excel.");
        } finally {
            setIsExporting(false);
        }
    };

    return (
        <button
            onClick={handleExport}
            disabled={isExporting}
            className={`w-full max-w-sm mx-auto flex items-center justify-center gap-3 py-4 px-6 rounded-2xl font-semibold text-[17px] tracking-tight transition-all duration-300 shadow-md ${isExporting
                    ? "bg-stone-800 text-stone-400 cursor-not-allowed scale-95 opacity-80"
                    : "bg-[#1C1C1E] text-white hover:bg-[#2C2C2E] hover:scale-[0.98] border border-white/5 active:bg-[#3C3C3E]"
                }`}
            style={{
                backdropFilter: "blur(10px)" // Tocco iOS
            }}
        >
            {isExporting ? (
                <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Generazione file...</span>
                </>
            ) : (
                <>
                    <FileSpreadsheet className="w-5 h-5 text-emerald-400" />
                    <span>Esporta per Commercialista</span>
                    <Download className="w-4 h-4 ml-1 opacity-60" />
                </>
            )}
        </button>
    );
}
