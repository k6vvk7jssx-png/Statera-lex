"use client";

import { useState } from "react";
import * as XLSX from "xlsx";
import { FileSpreadsheet, Download, Loader2 } from "lucide-react";
import { useUser, useSession } from "@clerk/nextjs";
import { createClient } from "@supabase/supabase-js";
import { getProfiloAction } from "@/app/impostazioni/actions";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// --- COSTANTI DEDUCIBILITA' ---
const DEDUCIBILITA_MAP: Record<string, number> = {
    "Lavoro": 1.0, "Cancelleria": 1.0, "Software": 1.0,
    "Spese Clienti": 1.0, "Rappresentanza": 1.0, "Formazione": 1.0,
    "Abbigliamento": 1.0, "Tasse": 1.0,
    "Telefonia": 0.80,
    "Ristoranti": 0.75, "Ristoranti / Trasferte": 0.75,
    "Utenze": 0.50, "Affitto": 0.50,
    "Auto/Trasporti": 0.20, "Carburante": 0.20, "Viaggi": 0.20,
    "Alimenti": 0, "Salute": 0, "Senza Tasse": 0, "Imprevisti": 0, "Altro": 0,
};

// --- COSTANTI CASSA FORENSE ---
const CASSA_ALIQUOTA_BASE = 0.17;
const CASSA_ALIQUOTA_ECCEDENZA = 0.03;
const CASSA_TETTO = 135000;
const CASSA_MATERNITA = 100;

// --- HELPER: formatta data gg/mm/aaaa ---
function fmtDate(dateStr: string | null | undefined): string {
    if (!dateStr) return "";
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return "";
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

// --- HELPER: imposta larghezze colonne auto ---
function autoWidth(ws: XLSX.WorkSheet, data: Record<string, unknown>[], minWidth = 10) {
    if (!data.length) return;
    const keys = Object.keys(data[0]);
    ws['!cols'] = keys.map((k) => {
        const maxLen = Math.max(
            k.length,
            ...data.map(row => String(row[k] ?? "").length)
        );
        return { wch: Math.max(minWidth, Math.min(maxLen + 2, 40)) };
    });
}

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
        if (!user) { alert("Utente non autenticato."); return; }
        setIsExporting(true);

        try {
            const supabase = getSupabase();
            const anno = new Date().getFullYear();
            const startOfYear = `${anno}-01-01`;

            // ========================================
            // 0. PROFILO UTENTE
            // ========================================
            const profiloResult = await getProfiloAction();
            const profile = profiloResult.data;
            let isOrdinario = false;
            let regimeName = "Forfettario";

            if (profile?.regime_fiscale === "ordinario" || localStorage.getItem("regime_fiscale_generale") === "ordinario") {
                isOrdinario = true;
                regimeName = "Ordinario";
            } else if (profile?.regime_fiscale?.includes("forfettario_5")) {
                regimeName = "Forfettario 5%";
            } else {
                regimeName = "Forfettario 15%";
            }

            // ========================================
            // 1. FETCH FATTURE
            // ========================================
            const { data: cause, error: errCause } = await supabase
                .from('cause')
                .select('*')
                .eq('user_id', user.id)
                .gte('data_sentenza', startOfYear)
                .order('data_sentenza', { ascending: true });

            if (errCause) throw errCause;

            // ========================================
            // 2. FETCH SPESE
            // ========================================
            const { data: transazioni, error: errTrans } = await supabase
                .from('transazioni')
                .select('*')
                .eq('user_id', user.id)
                .eq('tipo', 'uscita')
                .gte('data_transazione', startOfYear)
                .order('data_transazione', { ascending: true });

            if (errTrans) throw errTrans;

            // ========================================
            // CALCOLI AGGREGATI
            // ========================================
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const anomalie: any[] = [];
            let idFattura = 0;

            // --- FATTURE ---
            let totFatturato = 0;
            let totIncassato = 0;
            let totDaIncassare = 0;
            let sumCpa = 0;
            let sumIva = 0;
            let sumRitenute = 0;

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const fattureRows = (cause || []).map((c: any) => {
                idFattura++;
                const compensoBase = Number(c.compenso_base || c.compenso_lordo || 0);
                const speseGen = compensoBase * 0.15;
                const imponibileCassa = compensoBase + speseGen;
                const cpa = c.cpa_4 ? Number(c.cpa_4) : imponibileCassa * 0.04;
                const iva = c.iva_22 ? Number(c.iva_22) : 0;
                const ritenuta = c.ritenuta_acconto_20 ? Number(c.ritenuta_acconto_20) : (c.ritenuta_20 ? Number(c.ritenuta_20) : 0);
                const bollo = 0; // Non gestito nel DB attuale
                const totaleFattura = compensoBase + speseGen + cpa + iva + bollo;
                const nettoIncassato = totaleFattura - ritenuta;

                const isIncassata = c.stato === "incassata";
                const statoPagamento = isIncassata ? "Incassata" : "Da Riscuotere";

                totFatturato += totaleFattura;
                if (isIncassata) {
                    totIncassato += nettoIncassato;
                } else {
                    totDaIncassare += totaleFattura;
                }
                sumCpa += cpa;
                sumIva += iva;
                sumRitenute += ritenuta;

                // --- ANOMALIE FATTURE ---
                if (isIncassata && !c.data_sentenza) {
                    anomalie.push({ Tipo: "Fattura", "Gravità": "Media", Riferimento: `FAT-${idFattura}`, Descrizione: "Fattura incassata senza data", "Cosa controllare": "Verificare la data di incasso" });
                }
                if (!isIncassata) {
                    anomalie.push({ Tipo: "Fattura", "Gravità": "Bassa", Riferimento: `FAT-${idFattura}`, Descrizione: `Fattura non incassata: ${c.nome_causa}`, "Cosa controllare": "Sollecitare il pagamento" });
                }
                if (iva > 0 && !isOrdinario) {
                    anomalie.push({ Tipo: "Fattura", "Gravità": "Alta", Riferimento: `FAT-${idFattura}`, Descrizione: "IVA presente in regime forfettario", "Cosa controllare": "Verificare il regime fiscale della fattura" });
                }
                // Verifica coerenza totale
                const totAtteso = compensoBase + speseGen + cpa + iva;
                const diff = Math.abs(totaleFattura - totAtteso);
                if (diff > 0.02) {
                    anomalie.push({ Tipo: "Fattura", "Gravità": "Alta", Riferimento: `FAT-${idFattura}`, Descrizione: `Totale fattura non coerente (diff: €${diff.toFixed(2)})`, "Cosa controllare": "Ricalcolare compenso + spese + CPA + IVA" });
                }

                return {
                    "ID": `FAT-${idFattura}`,
                    "Data": fmtDate(c.data_sentenza),
                    "Cliente": c.nome_causa || "N/D",
                    "Stato pagamento": statoPagamento,
                    "Data incasso": isIncassata ? fmtDate(c.data_sentenza) : "",
                    "Compenso base (€)": compensoBase.toFixed(2),
                    "Spese generali (€)": speseGen.toFixed(2),
                    "CPA 4% (€)": cpa.toFixed(2),
                    "IVA 22% (€)": iva.toFixed(2),
                    "Ritenuta 20% (€)": ritenuta.toFixed(2),
                    "Bollo (€)": bollo.toFixed(2),
                    "Totale fattura (€)": totaleFattura.toFixed(2),
                    "Netto incassato (€)": nettoIncassato.toFixed(2),
                    "Note": c.tipologia_fiscale || "",
                };
            });

            // --- SPESE ---
            let totSpesePagate = 0;
            let totSpeseDeducibili = 0;
            let totSpeseNonDeducibili = 0;
            let idSpesa = 0;

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const speseRows = (transazioni || []).map((t: any) => {
                idSpesa++;
                const importo = Number(t.importo || 0);
                const categoria = t.categoria || "Altro";
                const rate = DEDUCIBILITA_MAP[categoria] ?? 0;
                const importoDeducibile = isOrdinario ? +(importo * rate).toFixed(2) : 0;
                const importoNonDeducibile = isOrdinario ? +(importo - importoDeducibile).toFixed(2) : importo;
                const fiscalmenteRilevante = rate > 0 ? "Sì" : "No";

                totSpesePagate += importo;
                totSpeseDeducibili += importoDeducibile;
                totSpeseNonDeducibili += importoNonDeducibile;

                // --- ANOMALIE SPESE ---
                if (!categoria || categoria === "Altro") {
                    anomalie.push({ Tipo: "Spesa", "Gravità": "Bassa", Riferimento: `SPE-${idSpesa}`, Descrizione: "Spesa senza categoria specifica", "Cosa controllare": "Assegnare la categoria corretta" });
                }

                return {
                    "ID": `SPE-${idSpesa}`,
                    "Data": fmtDate(t.data_transazione),
                    "Fornitore": t.descrizione || "N/D",
                    "Categoria": categoria,
                    "Totale pagato (€)": importo.toFixed(2),
                    "% deducibile": isOrdinario ? `${(rate * 100).toFixed(0)}%` : "N/A (Forf.)",
                    "Importo deducibile (€)": importoDeducibile.toFixed(2),
                    "Importo NON deducibile (€)": importoNonDeducibile.toFixed(2),
                    "Fiscalmente rilevante": fiscalmenteRilevante,
                    "Note": "",
                };
            });

            // --- CALCOLI FISCO ---
            // Per il lordoIncassato usiamo solo le cause incassate
            let lordoIncassatoPerFisco = 0;
            (cause || []).forEach(c => {
                if (c.stato !== "incassata") return;
                const comp = Number(c.compenso_base || c.compenso_lordo || 0);
                lordoIncassatoPerFisco += comp + comp * 0.15;
            });

            let imponibileStimato = 0;
            if (isOrdinario) {
                imponibileStimato = Math.max(0, lordoIncassatoPerFisco - totSpeseDeducibili);
            } else {
                imponibileStimato = lordoIncassatoPerFisco * 0.78;
            }

            // Cassa Forense
            let cassaSoggettiva = 0;
            if (imponibileStimato <= CASSA_TETTO) {
                cassaSoggettiva = imponibileStimato * CASSA_ALIQUOTA_BASE;
            } else {
                cassaSoggettiva = (CASSA_TETTO * CASSA_ALIQUOTA_BASE) + ((imponibileStimato - CASSA_TETTO) * CASSA_ALIQUOTA_ECCEDENZA);
            }

            // Tasse stimate
            let tasseStimate = 0;
            if (isOrdinario) {
                const baseIrpef = Math.max(0, imponibileStimato - cassaSoggettiva);
                let irpef = 0;
                if (baseIrpef > 0) {
                    irpef += Math.min(baseIrpef, 28000) * 0.23;
                    if (baseIrpef > 28000) irpef += Math.min(baseIrpef - 28000, 22000) * 0.33;
                    if (baseIrpef > 50000) irpef += (baseIrpef - 50000) * 0.43;
                }
                tasseStimate = irpef;
            } else {
                const baseImposta = Math.max(0, imponibileStimato - cassaSoggettiva);
                const aliquota = regimeName.includes("5%") ? 0.05 : 0.15;
                tasseStimate = baseImposta * aliquota;
            }

            // Netti
            const nettoTeorico = totIncassato - tasseStimate - sumCpa - cassaSoggettiva - CASSA_MATERNITA - totSpesePagate;
            const soldoDaAccantonare = tasseStimate + sumCpa + cassaSoggettiva + CASSA_MATERNITA + sumIva;
            const nettoPrudenziale = totIncassato - soldoDaAccantonare - totSpesePagate;

            // --- VERSAMENTI (placeholder: l'app non ha ancora una tabella versamenti) ---
            const versamentiRows = [
                { "ID": "", "Data pagamento": "", "Tipo versamento": "", "Codice tributo": "", "Periodo": `Anno ${anno}`, "Importo (€)": "", "Metodo pagamento": "", "Note": "Nessun versamento registrato — compilare manualmente" }
            ];

            // Anomalia versamenti mancanti
            anomalie.push({ Tipo: "Versamento", "Gravità": "Media", Riferimento: "—", Descrizione: "Nessun versamento F24/Cassa registrato nell'app", "Cosa controllare": "Compilare manualmente il foglio VERSAMENTI o aggiornare l'app" });

            if (anomalie.length === 0) {
                anomalie.push({ Tipo: "—", "Gravità": "—", Riferimento: "—", Descrizione: "Nessuna anomalia rilevata", "Cosa controllare": "—" });
            }

            // ========================================
            // FOGLIO RIEPILOGO (struttura chiave-valore)
            // ========================================
            const riepilogoRows = [
                { "Sezione": "DATI GENERALI", "Voce": "Anno fiscale", "Valore": anno },
                { "Sezione": "", "Voce": "Regime fiscale", "Valore": regimeName },
                { "Sezione": "", "Voce": "Data export", "Valore": fmtDate(new Date().toISOString()) },
                { "Sezione": "", "Voce": "", "Valore": "" },
                { "Sezione": "ENTRATE", "Voce": "Totale fatturato", "Valore": `€ ${totFatturato.toFixed(2)}` },
                { "Sezione": "", "Voce": "Totale incassato (netto ritenute)", "Valore": `€ ${totIncassato.toFixed(2)}` },
                { "Sezione": "", "Voce": "Totale da incassare", "Valore": `€ ${totDaIncassare.toFixed(2)}` },
                { "Sezione": "", "Voce": "", "Valore": "" },
                { "Sezione": "SPESE", "Voce": "Totale spese pagate", "Valore": `€ ${totSpesePagate.toFixed(2)}` },
                { "Sezione": "", "Voce": "Totale spese deducibili", "Valore": isOrdinario ? `€ ${totSpeseDeducibili.toFixed(2)}` : "N/A (Forfettario)" },
                { "Sezione": "", "Voce": "Totale spese non deducibili", "Valore": isOrdinario ? `€ ${totSpeseNonDeducibili.toFixed(2)}` : "N/A (Forfettario)" },
                { "Sezione": "", "Voce": "", "Valore": "" },
                { "Sezione": "FISCO", "Voce": "Imponibile stimato", "Valore": `€ ${imponibileStimato.toFixed(2)}` },
                { "Sezione": "", "Voce": "Tasse stimate (IRPEF/Sostitutiva)", "Valore": `€ ${tasseStimate.toFixed(2)}` },
                { "Sezione": "", "Voce": "IVA da versare", "Valore": `€ ${sumIva.toFixed(2)}` },
                { "Sezione": "", "Voce": "Ritenute subite (credito)", "Valore": `€ ${sumRitenute.toFixed(2)}` },
                { "Sezione": "", "Voce": "F24 già pagati", "Valore": "Da compilare" },
                { "Sezione": "", "Voce": "", "Valore": "" },
                { "Sezione": "CASSA FORENSE", "Voce": "CPA incassata (4%)", "Valore": `€ ${sumCpa.toFixed(2)}` },
                { "Sezione": "", "Voce": "Cassa soggettiva stimata", "Valore": `€ ${cassaSoggettiva.toFixed(2)}` },
                { "Sezione": "", "Voce": "Maternità", "Valore": `€ ${CASSA_MATERNITA.toFixed(2)}` },
                { "Sezione": "", "Voce": "Cassa già versata", "Valore": "Da compilare" },
                { "Sezione": "", "Voce": "Cassa ancora da versare", "Valore": "Da compilare" },
                { "Sezione": "", "Voce": "Minimale annuo di legge", "Valore": "€ 3.600,00" },
                { "Sezione": "", "Voce": "", "Valore": "" },
                { "Sezione": "NETTO", "Voce": "Netto teorico", "Valore": `€ ${nettoTeorico.toFixed(2)}` },
                { "Sezione": "", "Voce": "Netto prudenziale (dopo accantonamenti)", "Valore": `€ ${nettoPrudenziale.toFixed(2)}` },
                { "Sezione": "", "Voce": "Soldi da accantonare", "Valore": `€ ${soldoDaAccantonare.toFixed(2)}` },
                { "Sezione": "", "Voce": "Liquidità realmente disponibile", "Valore": `€ ${Math.max(0, nettoPrudenziale).toFixed(2)}` },
            ];

            // ========================================
            // CREAZIONE WORKBOOK
            // ========================================
            const wb = XLSX.utils.book_new();

            // 1. RIEPILOGO
            const wsRiepilogo = XLSX.utils.json_to_sheet(riepilogoRows);
            wsRiepilogo['!cols'] = [{ wch: 18 }, { wch: 40 }, { wch: 25 }];
            XLSX.utils.book_append_sheet(wb, wsRiepilogo, "RIEPILOGO");

            // 2. FATTURE
            const wsFatture = fattureRows.length > 0
                ? XLSX.utils.json_to_sheet(fattureRows)
                : XLSX.utils.json_to_sheet([{ "Messaggio": "Nessuna fattura registrata nell'anno" }]);
            if (fattureRows.length > 0) autoWidth(wsFatture, fattureRows);
            wsFatture['!autofilter'] = { ref: `A1:N${fattureRows.length + 1}` };
            XLSX.utils.book_append_sheet(wb, wsFatture, "FATTURE");

            // 3. SPESE
            const wsSpese = speseRows.length > 0
                ? XLSX.utils.json_to_sheet(speseRows)
                : XLSX.utils.json_to_sheet([{ "Messaggio": "Nessuna spesa registrata nell'anno" }]);
            if (speseRows.length > 0) autoWidth(wsSpese, speseRows);
            wsSpese['!autofilter'] = { ref: `A1:J${speseRows.length + 1}` };
            XLSX.utils.book_append_sheet(wb, wsSpese, "SPESE");

            // 4. VERSAMENTI
            const wsVersamenti = XLSX.utils.json_to_sheet(versamentiRows);
            wsVersamenti['!cols'] = [{ wch: 8 }, { wch: 16 }, { wch: 22 }, { wch: 16 }, { wch: 12 }, { wch: 14 }, { wch: 18 }, { wch: 40 }];
            XLSX.utils.book_append_sheet(wb, wsVersamenti, "VERSAMENTI");

            // 5. ANOMALIE
            const wsAnomalie = XLSX.utils.json_to_sheet(anomalie);
            autoWidth(wsAnomalie, anomalie);
            XLSX.utils.book_append_sheet(wb, wsAnomalie, "ANOMALIE");

            // --- DOWNLOAD ---
            XLSX.writeFile(wb, `StateraLex_Export_${anno}.xlsx`);

        } catch (error) {
            console.error("Errore durante l'export:", error);
            alert("Errore durante la generazione dell'Excel.");
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
            style={{ backdropFilter: "blur(10px)" }}
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
