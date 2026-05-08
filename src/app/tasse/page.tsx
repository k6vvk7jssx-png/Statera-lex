"use client";

import { useState, useEffect } from "react";
import { useUser, useSession } from "@clerk/nextjs";
import { Book } from "lucide-react";
import { createClient } from "@supabase/supabase-js";
import { getProfiloAction } from "@/app/impostazioni/actions";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export default function Tasse() {
    const { isLoaded, isSignedIn, user } = useUser();
    const { session } = useSession();

    const getSupabase = () => {
        return createClient(supabaseUrl, supabaseKey, {
            global: {
                fetch: async (url, options = {}) => {
                    let clerkToken;
                    try {
                        clerkToken = await session?.getToken({ template: 'supabase' });
                    } catch {
                        console.warn("Nessun template 'supabase' trovato in Clerk, uso token default");
                        clerkToken = await session?.getToken();
                    }
                    const headers = new Headers(options?.headers);
                    if (clerkToken) headers.set('Authorization', `Bearer ${clerkToken}`);
                    return fetch(url, { ...options, headers, cache: 'no-store' });
                },
            },
        });
    };
    const [mod, setMod] = useState<"auto" | "manual">("auto");

    // Stati per Calcolatore Manuale
    const [lordo, setLordo] = useState<string>("");
    const [regime, setRegime] = useState<"forfettario_5" | "forfettario_15" | "ordinario" | "free">("forfettario_15");
    const [scaglioneManuale, setScaglioneManuale] = useState<number>(43);
    const [risultatoManuale, setRisultatoManuale] = useState<Record<string, number> | null>(null);

    // Stati per Calcolatore Spese Simulate
    interface SpesaSimulata { id: string; nome: string; importo: number; }
    const [speseSimulate, setSpeseSimulate] = useState<SpesaSimulata[]>([]);
    const [newSpesaNome, setNewSpesaNome] = useState("");
    const [newSpesaImporto, setNewSpesaImporto] = useState("");

    const handleQuickAdd = (nome: string, importo: number) => {
        setSpeseSimulate(prev => [...prev, { id: Math.random().toString(), nome, importo }]);
    };

    const handleAddCustomSpesa = () => {
        if (!newSpesaNome || !newSpesaImporto) return;
        setSpeseSimulate(prev => [...prev, { id: Math.random().toString(), nome: newSpesaNome, importo: parseFloat(newSpesaImporto.replace(",", ".")) }]);
        setNewSpesaNome("");
        setNewSpesaImporto("");
    };

    const handleRemoveSpesa = (id: string) => {
        setSpeseSimulate(prev => prev.filter(s => s.id !== id));
    };

    const totaleSpeseSimulate = speseSimulate.reduce((acc, curr) => acc + curr.importo, 0);

    // Regola Fiscale FONDAMENTALE: Se forfettario, ignora e svuota le spese simulate manuali
    useEffect(() => {
        if (regime !== 'ordinario') {
            setSpeseSimulate([]);
        }
    }, [regime]);

    interface CausaDettaglio {
        id: string;
        nome: string;
        data: string;
        lordo: number;
        tasse: number;
        cassa: number;
        netto: number;
        regime: string;
    }

    const [datiAnnuali, setDatiAnnuali] = useState({
        incassatoLordo: 0,
        tasseDaPagare: 0,
        cassaDaPagare: 0,
        nettoTasche: 0,
        speseDeducibili: 0,
        ritenuteTotali: 0,
        fiscoDaVersare: 0,
        isOrdinario: false
    });
    const [dettagliCause, setDettagliCause] = useState<CausaDettaglio[]>([]);
    const [isLoadingDati, setIsLoadingDati] = useState(true);
    const [showTutorial, setShowTutorial] = useState(false);

    useEffect(() => {
        if (isSignedIn && user && mod === "auto") {
            calcolaTasseAnnualiReali();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isSignedIn, user, mod]);

    const calcolaTasseAnnualiReali = async () => {
        setIsLoadingDati(true);
        try {
            const supabase = getSupabase();
            // 1. Prendi tutte le Cause dell'anno corrente
            const currentYear = new Date().getFullYear();
            const startOfYear = `${currentYear}-01-01`;
            const endOfYear = `${currentYear}-12-31`;

            const { data: cause, error: errCause } = await supabase
                .from('cause')
                .select('*')
                .eq('user_id', user?.id)
                .gte('data_sentenza', startOfYear)
                .lte('data_sentenza', endOfYear);

            if (errCause) {
                console.error("Errore fetch cause annue:", errCause);
            }

            // Carica profilo utente via Server Action (affidabile, bypassa RLS/UUID)
            const profiloResult = await getProfiloAction();
            const profile = profiloResult.data;

            let currentScaglione = 33;
            if (profile?.expected_irpef_bracket) {
                currentScaglione = parseInt(profile.expected_irpef_bracket);
                setScaglioneManuale(currentScaglione); // Init simulatore col valore utente
            }

            // 2. Prendi tutte le Spese dell'anno corrente
            const { data: spese } = await supabase
                .from('transazioni')
                .select('importo, importo_deducibile, categoria')
                .eq('user_id', user?.id)
                .eq('tipo', 'uscita')
                .gte('data_transazione', startOfYear)
                .lte('data_transazione', endOfYear);

            const speseTotaliDeducibili = (spese || []).reduce((acc, curr) => acc + Number(curr.importo_deducibile ?? curr.importo), 0);

            let totLordo = 0;
            let totTasse = 0;
            let totCassa = 0;
            let totNetto = 0;

            let imponibileOrdinarioAnnuo = 0;
            let totCpaOrdinario = 0;
            let totIvaOrdinario = 0;
            let totRitenutaOrdinario = 0;

            const causeDettaglio: CausaDettaglio[] = [];

            if (cause) {
                cause.forEach(c => {
                    const compensoBase = Number(c.compenso_base || c.compenso_lordo || 0);
                    const r = c.tipologia_fiscale || "forfettario_15";

                    let detLordo = 0;
                    let detTasse = 0;
                    let detCassa = 0;
                    let detNetto = 0;

                    if (r === "forfettario_5" || r === "forfettario_15") {
                        const speseGenerali = compensoBase * 0.15;
                        const redditoImponibileLordo = (compensoBase + speseGenerali) * 0.78;

                        let cassaSoggettiva = 0;
                        if (redditoImponibileLordo <= 135000) {
                            cassaSoggettiva = redditoImponibileLordo * 0.17;
                        } else {
                            cassaSoggettiva = (135000 * 0.17) + ((redditoImponibileLordo - 135000) * 0.03);
                        }
                        const cpa = c.cpa_4 ? Number(c.cpa_4) : (compensoBase + speseGenerali) * 0.04;
                        const cassaForenseTotale = cassaSoggettiva + cpa;

                        const baseImponibileNetta = redditoImponibileLordo - cassaSoggettiva;
                        const aliquota = r === "forfettario_5" ? 0.05 : 0.15;
                        const tasse = baseImponibileNetta * aliquota;

                        // Per forfettario volume d'affari è Compenso base + 15% spese + CPA in fattura (esente IVA)
                        const volumeAffari = c.compenso_lordo ? Number(c.compenso_lordo) : (compensoBase + speseGenerali + cpa);

                        totLordo += volumeAffari;
                        totTasse += tasse;
                        totCassa += cassaForenseTotale;

                        detLordo = volumeAffari;
                        detTasse = tasse;
                        detCassa = cassaForenseTotale;
                        detNetto = volumeAffari - tasse - cassaForenseTotale;

                    } else if (r === "ordinario") {
                        const speseGenerali = compensoBase * 0.15;
                        const imponibileLordoItem = compensoBase + speseGenerali;
                        imponibileOrdinarioAnnuo += imponibileLordoItem;

                        const cpa = c.cpa_4 ? Number(c.cpa_4) : imponibileLordoItem * 0.04;
                        const iva = c.iva_22 ? Number(c.iva_22) : (imponibileLordoItem + cpa) * 0.22;

                        totCpaOrdinario += cpa;
                        totIvaOrdinario += iva;

                        // NOTA: La Ritenuta di acconto nel regime ordinario si calcola anche sulle spese generali
                        const ritenutaItem = c.ritenuta_20 ? Number(c.ritenuta_20) : imponibileLordoItem * 0.20;
                        totRitenutaOrdinario += ritenutaItem;

                        const volumeAffari = c.compenso_lordo ? Number(c.compenso_lordo) : (imponibileLordoItem + cpa + iva);
                        totLordo += volumeAffari;

                        // Calcolo proporzionale singola fattura per lo spaccato visivo
                        let cassaSoggettivaItem = 0;
                        if (imponibileLordoItem <= 135000) {
                            cassaSoggettivaItem = imponibileLordoItem * 0.17;
                        } else {
                            cassaSoggettivaItem = (135000 * 0.17) + ((imponibileLordoItem - 135000) * 0.03);
                        }
                        const cassaForenseItem = cassaSoggettivaItem + cpa;

                        const imponibileIrpefItem = imponibileLordoItem - cassaSoggettivaItem;
                        
                        let irpefLordaItem = 0.0;
                        if (imponibileIrpefItem > 0) {
                            const primo_scaglione = Math.min(imponibileIrpefItem, 28000);
                            irpefLordaItem += primo_scaglione * 0.23;
                            
                            if (imponibileIrpefItem > 28000) {
                                const secondo_scaglione = Math.min(imponibileIrpefItem - 28000, 22000);
                                irpefLordaItem += secondo_scaglione * 0.33;
                            }
                            
                            if (imponibileIrpefItem > 50000) {
                                const terzo_scaglione = imponibileIrpefItem - 50000;
                                irpefLordaItem += terzo_scaglione * 0.43;
                            }
                        }
                        
                        const addizionaliItem = imponibileIrpefItem * 0.03;

                        const tasseItem = Math.max(0, irpefLordaItem - ritenutaItem) + addizionaliItem + iva;

                        detLordo = volumeAffari;
                        detTasse = tasseItem;
                        detCassa = cassaForenseItem;
                        detNetto = volumeAffari - tasseItem - cassaForenseItem;
                    }

                    causeDettaglio.push({
                        id: c.id,
                        nome: c.nome_causa || "Senza Nome",
                        data: c.data_registrazione || c.created_at || new Date().toISOString(),
                        lordo: detLordo,
                        tasse: detTasse,
                        cassa: detCassa,
                        netto: detNetto,
                        regime: r
                    });
                });
            }

            if (imponibileOrdinarioAnnuo > 0) {
                const speseDeducibiliTotali = speseTotaliDeducibili;

                // CassaTotale = CPA + CassaSoggettivo
                let cassaSoggettivo = 0;
                if (imponibileOrdinarioAnnuo <= 135000) {
                    cassaSoggettivo = imponibileOrdinarioAnnuo * 0.17;
                } else {
                    cassaSoggettivo = (135000 * 0.17) + ((imponibileOrdinarioAnnuo - 135000) * 0.03);
                }
                const cassaForenseTotale = totCpaOrdinario + cassaSoggettivo;

                // ImponibileIrpef = (Compenso + SpeseGenerali) - CassaSoggettivo - SpeseDeducibili
                const imponibileIrpef = Math.max(0, imponibileOrdinarioAnnuo - cassaSoggettivo - speseDeducibiliTotali);

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

                // IrpefDaVersare = max(0, IrpefLorda - Ritenuta)
                const irpefDaVersare = Math.max(0, irpefLorda - totRitenutaOrdinario);

                // FiscoDaVersare = IVA + IrpefDaVersare
                const fiscoDaVersare = totIvaOrdinario + irpefDaVersare;

                totTasse += fiscoDaVersare;
                totCassa += cassaForenseTotale;

                // Netto = VolumeAffariLordo - Ritenuta - FiscoDaVersare - CassaTotale - SpeseDeducibili
                totNetto = totLordo - totRitenutaOrdinario - fiscoDaVersare - cassaForenseTotale - speseTotaliDeducibili;

                setDatiAnnuali({
                    incassatoLordo: totLordo,
                    tasseDaPagare: totTasse,
                    cassaDaPagare: totCassa,
                    nettoTasche: totNetto,
                    speseDeducibili: speseTotaliDeducibili,
                    ritenuteTotali: totRitenutaOrdinario,
                    fiscoDaVersare: fiscoDaVersare,
                    isOrdinario: true
                });
            } else {
                // Forfettario/Free/Misto senza ordinario
                totNetto = totLordo - totTasse - totCassa;

                setDatiAnnuali({
                    incassatoLordo: totLordo,
                    tasseDaPagare: totTasse,
                    cassaDaPagare: totCassa,
                    nettoTasche: totNetto,
                    speseDeducibili: speseTotaliDeducibili,
                    ritenuteTotali: 0,
                    fiscoDaVersare: 0,
                    isOrdinario: false
                });
            }
            setDettagliCause(causeDettaglio);

        } catch (error) {
            console.error("Errore nel calcolo tasse reali", error);
        } finally {
            setIsLoadingDati(false);
        }
    };

    const calcolaManuale = () => {
        const importoLordo = parseFloat(lordo.replace(",", "."));
        if (isNaN(importoLordo) || importoLordo <= 0) return;

        let imponibile = 0, tasse = 0, cassa = 0, netto = 0, volumeAffariLordo = 0;

        if (regime === "forfettario_5" || regime === "forfettario_15") {
            const compensoBase = importoLordo;
            const speseGenerali = compensoBase * 0.15;
            const redditoImponibileLordo = (compensoBase + speseGenerali) * 0.78;

            let cassaSoggettiva = 0;
            if (redditoImponibileLordo <= 135000) {
                cassaSoggettiva = redditoImponibileLordo * 0.17;
            } else {
                cassaSoggettiva = (135000 * 0.17) + ((redditoImponibileLordo - 135000) * 0.03);
            }
            const cpa = (compensoBase + speseGenerali) * 0.04;
            cassa = cassaSoggettiva + cpa;

            const baseImponibileNetta = redditoImponibileLordo - cassaSoggettiva;
            const aliquotaTasse = regime === "forfettario_5" ? 0.05 : 0.15;
            tasse = baseImponibileNetta * aliquotaTasse;

            volumeAffariLordo = compensoBase + speseGenerali + cpa;
            imponibile = redditoImponibileLordo;
            netto = volumeAffariLordo - tasse - cassa;
        } else if (regime === "ordinario") {
            const compensoBase = importoLordo;
            const speseGenerali = compensoBase * 0.15;
            const imponibileLordo = compensoBase + speseGenerali;
            const speseDeducibili = totaleSpeseSimulate;

            const imponibileCassa = Math.max(0, imponibileLordo - speseDeducibili);
            let cassaSoggettiva = 0;
            if (imponibileCassa <= 135000) {
                cassaSoggettiva = imponibileCassa * 0.17;
            } else {
                cassaSoggettiva = (135000 * 0.17) + ((imponibileCassa - 135000) * 0.03);
            }
            const cpa = imponibileLordo * 0.04;
            cassa = cassaSoggettiva + cpa;

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
            tasse = ivaDaVersare + irpefaSaldo + addizionali;

            volumeAffariLordo = imponibileLordo + cpa + ivaDaVersare;
            imponibile = imponibileIrpef;
            netto = volumeAffariLordo - tasse - cassa - ritenutaScontata - speseDeducibili; // in fattura manuale considero tasca reale dopo ritenuta subita e spese sostenute
        } else {
            // Free
            imponibile = 0; tasse = 0; cassa = 0; netto = importoLordo; volumeAffariLordo = importoLordo;
        }

        setRisultatoManuale({ imponibile, tasse, cassa, netto, volumeAffariLordo });
    };

    if (!isLoaded || !isSignedIn) return null;

    return (
        <div className="pb-20">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem" }}>
                <h1 style={{ marginBottom: 0 }}>Cassetto Fiscale {new Date().getFullYear()}</h1>
                <button
                    onClick={() => setShowTutorial(true)}
                    style={{ background: "none", border: "none", cursor: "pointer", color: "#007AFF", padding: "0.5rem" }}
                    aria-label="Apri guida"
                >
                    <Book size={28} />
                </button>
            </div>

            {/* Segmented Control per passare da DB a Simulatore */}
            <div className="ios-select-group" style={{ marginBottom: "2rem" }}>
                <button
                    className={`ios-segment ${mod === "auto" ? "active" : ""}`}
                    onClick={() => setMod("auto")}
                >
                    📊 Bilancio Reale
                </button>
                <button
                    className={`ios-segment ${mod === "manual" ? "active" : ""}`}
                    onClick={() => setMod("manual")}
                >
                    🧮 Simulatore
                </button>
            </div>

            {mod === "auto" && (
                <>
                    {isLoadingDati ? (
                        <div style={{ textAlign: "center", padding: "2rem", opacity: 0.5 }}>Calcolo bilanci in corso...</div>
                    ) : datiAnnuali.incassatoLordo === 0 ? (
                        <div style={{ textAlign: "center", padding: "3rem 1rem", opacity: 0.6 }}>
                            <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>🏛️</div>
                            Ancora nessuna fattura o incasso registrato nel {new Date().getFullYear()}. Le tasse appariranno qui automaticamente appena registrerai una causa!
                        </div>
                    ) : (
                        <div className="ios-card" style={{ animation: "slideUp 0.3s ease-out" }}>
                            <h2 style={{ textAlign: "center", marginBottom: "1.5rem" }}>Quadro Riassuntivo Annuo</h2>

                            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "1rem", borderBottom: "1px solid var(--border)", paddingBottom: "0.5rem" }}>
                                <span style={{ opacity: 0.8 }}>Volume d&apos;Affari Lordo</span>
                                <span style={{ fontWeight: "600", color: "var(--foreground)" }}>€{datiAnnuali.incassatoLordo.toFixed(2)}</span>
                            </div>

                            {datiAnnuali.isOrdinario && (
                                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "1rem", borderBottom: "1px solid var(--border)", paddingBottom: "0.5rem", color: "#a78bfa" }}>
                                    <span>Ritenute d&apos;Acconto (già pagate)</span>
                                    <span style={{ fontWeight: "bold" }}>- €{datiAnnuali.ritenuteTotali.toFixed(2)}</span>
                                </div>
                            )}

                            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "1rem", borderBottom: "1px solid var(--border)", paddingBottom: "0.5rem", color: "var(--destructive)" }}>
                                <span>{datiAnnuali.isOrdinario ? 'Fisco da versare (IVA+IRPEF)' : 'Fisco (IRPEF/Sostitutiva) Totale'}</span>
                                <span style={{ fontWeight: "bold" }}>- €{datiAnnuali.isOrdinario ? datiAnnuali.fiscoDaVersare.toFixed(2) : datiAnnuali.tasseDaPagare.toFixed(2)}</span>
                            </div>

                            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "1rem", borderBottom: "1px solid var(--border)", paddingBottom: "0.5rem", color: "var(--destructive)" }}>
                                <span>Cassa Forense stimata</span>
                                <span style={{ fontWeight: "bold" }}>- €{datiAnnuali.cassaDaPagare.toFixed(2)}</span>
                            </div>

                            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "1rem", borderBottom: "1px solid var(--border)", paddingBottom: "0.5rem", color: "var(--primary)" }}>
                                <span>Spese / Costi affrontati</span>
                                <span style={{ fontWeight: "600" }}>- €{datiAnnuali.speseDeducibili.toFixed(2)}</span>
                            </div>

                            <div style={{ display: "flex", justifyContent: "space-between", paddingTop: "0.5rem", fontSize: "1.2rem", fontWeight: "bold", color: "var(--success)" }}>
                                <span>Netto in Tasca Stimato</span>
                                <span>€{datiAnnuali.nettoTasche.toFixed(2)}</span>
                            </div>
                        </div>
                    )}

                    {/* Spaccato Causale */}
                    {dettagliCause.length > 0 && mod === "auto" && datiAnnuali.incassatoLordo > 0 && (
                        <div style={{ marginTop: "2rem", animation: "slideUp 0.4s ease-out" }}>
                            <h2 style={{ marginBottom: "1rem" }}>Spaccato Singole Entrate</h2>
                            {dettagliCause.map(c => (
                                <div key={c.id} className="ios-card" style={{ marginBottom: "1rem", padding: "1rem" }}>
                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                                        <h3 style={{ margin: 0, fontSize: "1.1rem" }}>{c.nome}</h3>
                                        <span style={{ fontSize: "0.8rem", opacity: 0.6 }}>
                                            {new Date(c.data).toLocaleDateString()}
                                        </span>
                                    </div>
                                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.9rem", marginBottom: "4px" }}>
                                        <span>Ritornato in Fattura (Lordo):</span>
                                        <span style={{ fontWeight: "bold" }}>€{c.lordo.toFixed(2)}</span>
                                    </div>
                                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.9rem", marginBottom: "4px", color: "var(--destructive)" }}>
                                        <span>Fisco (IRPEF/IVA/Sost):</span>
                                        <span>- €{c.tasse.toFixed(2)}</span>
                                    </div>
                                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.9rem", marginBottom: "4px", color: "var(--destructive)" }}>
                                        <span>Cassa (CPA+Sogg):</span>
                                        <span>- €{c.cassa.toFixed(2)}</span>
                                    </div>
                                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "1rem", marginTop: "8px", paddingTop: "8px", borderTop: "1px solid var(--border)", color: "var(--success)", fontWeight: "bold" }}>
                                        <span>Netto Effettivo:</span>
                                        <span>€{c.netto.toFixed(2)}</span>
                                    </div>
                                    {c.regime === "ordinario" && (
                                        <div style={{ fontSize: "0.75rem", opacity: 0.6, marginTop: "6px", textAlign: "right" }}>
                                            *Stima pre-deduzioni annuali
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </>
            )}

            {mod === "manual" && (
                <>
                    <p>Simula l&apos;incasso di una fattura o del lordo per visualizzare il netto stimato ad personam.</p>
                    <div className="ios-card" style={{ animation: "slideUp 0.3s ease-out" }}>
                        <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: "600" }}>
                            Incasso Lordo (€)
                        </label>
                        <input
                            type="number"
                            value={lordo}
                            onChange={(e) => setLordo(e.target.value)}
                            placeholder="Es: 1500"
                            className="ios-input"
                        />

                        <label style={{ display: "block", marginTop: "1rem", marginBottom: "0.5rem", fontWeight: "600" }}>
                            Regime Fiscale del singolo compenso
                        </label>

                        <div className="ios-select-group" style={{ flexDirection: "column" }}>
                            <button
                                className={`ios-segment ${regime === 'forfettario_5' ? 'active' : ''}`}
                                onClick={() => setRegime('forfettario_5')}
                            >
                                Forfettario (5%)
                            </button>
                            <button
                                className={`ios-segment ${regime === 'forfettario_15' ? 'active' : ''}`}
                                onClick={() => setRegime('forfettario_15')}
                            >
                                Forfettario (15%)
                            </button>
                            <button
                                className={`ios-segment ${regime === 'ordinario' ? 'active' : ''}`}
                                onClick={() => setRegime('ordinario')}
                            >
                                Ordinario
                            </button>
                            <button
                                className={`ios-segment ${regime === 'free' ? 'active' : ''}`}
                                onClick={() => setRegime('free')}
                            >
                                Esente / Senza Tasse
                            </button>
                        </div>

                        {/* SEZIONE SPESE DEDUCIBILI RISERVATA AL REGIME ORDINARIO */}
                        {(regime === 'forfettario_5' || regime === 'forfettario_15') && (
                            <div className="mb-6 p-4 rounded-xl bg-orange-500/10 border border-orange-500/20 text-orange-600 dark:text-orange-400">
                                <span className="font-semibold block mb-1">ℹ️ Info Deducibilità</span>
                                <span className="text-sm">
                                    Nel Regime Forfettario le spese reali non sono deducibili. Il fisco calcola i costi in modo forfettario tramite il Coefficiente di Redditività (78% per Avvocati) e non sottrarrà altre spese dal tuo imponibile.
                                </span>
                            </div>
                        )}

                        {regime === 'ordinario' && (
                            <div className="mb-6 p-5 rounded-2xl bg-white/5 border border-white/10">
                                <h3 className="text-[1.05rem] font-bold mb-4">Simula Spese Deducibili</h3>

                                <p className="text-sm opacity-70 mb-3">Aggiungi una spesa rapida:</p>
                                <div className="grid grid-cols-2 lg:grid-cols-3 gap-2 mb-4">
                                    <button onClick={() => handleQuickAdd('Software/Abbonamenti', 50)} className="text-sm py-2 px-3 rounded-lg bg-[#007AFF]/10 text-[#007AFF] border border-[#007AFF]/20 hover:bg-[#007AFF]/20 transition-colors">💻 Software (50€)</button>
                                    <button onClick={() => handleQuickAdd('Cancelleria', 30)} className="text-sm py-2 px-3 rounded-lg bg-[#007AFF]/10 text-[#007AFF] border border-[#007AFF]/20 hover:bg-[#007AFF]/20 transition-colors">📎 Cancelleria (30€)</button>
                                    <button onClick={() => handleQuickAdd('Bollette/Utenze', 100)} className="text-sm py-2 px-3 rounded-lg bg-[#007AFF]/10 text-[#007AFF] border border-[#007AFF]/20 hover:bg-[#007AFF]/20 transition-colors">🔌 Utenze (100€)</button>
                                    <button onClick={() => handleQuickAdd('Corsi di Formazione', 250)} className="text-sm py-2 px-3 rounded-lg bg-[#007AFF]/10 text-[#007AFF] border border-[#007AFF]/20 hover:bg-[#007AFF]/20 transition-colors">🎓 Corsi/Ord. (250€)</button>
                                </div>

                                <p className="text-sm opacity-70 mb-2 mt-4">Simula spesa personalizzata:</p>
                                <div className="flex gap-2 mb-4">
                                    <input
                                        type="text"
                                        placeholder="Nome"
                                        className="ios-input !mb-0 !py-2 !text-base focus:ring-[#007AFF]"
                                        value={newSpesaNome}
                                        onChange={e => setNewSpesaNome(e.target.value)}
                                    />
                                    <input
                                        type="number"
                                        placeholder="€"
                                        className="ios-input !mb-0 !py-2 !text-base w-24 focus:ring-[#007AFF]"
                                        value={newSpesaImporto}
                                        onChange={e => setNewSpesaImporto(e.target.value)}
                                    />
                                    <button onClick={handleAddCustomSpesa} className="bg-[#007AFF] text-white font-bold rounded-xl px-4 hover:opacity-80">+</button>
                                </div>

                                {speseSimulate.length > 0 && (
                                    <div className="mt-4 pt-4 border-t border-white/10">
                                        <div className="flex justify-between items-center mb-2">
                                            <span className="font-semibold text-sm opacity-60 uppercase tracking-wider">Lista Spese Mese</span>
                                            <span className="font-bold text-red-500">Tot: €{totaleSpeseSimulate.toFixed(2)}</span>
                                        </div>
                                        <div className="flex flex-col gap-2 max-h-32 overflow-y-auto pr-2">
                                            {speseSimulate.map(s => (
                                                <div key={s.id} className="flex justify-between items-center bg-black/20 dark:bg-white/5 py-2 px-3 rounded-lg border border-black/5 dark:border-white/5">
                                                    <span className="text-sm truncate mr-2">{s.nome}</span>
                                                    <div className="flex items-center gap-3">
                                                        <span className="text-sm font-semibold max-w-[80px]">€{s.importo.toFixed(2)}</span>
                                                        <button onClick={() => handleRemoveSpesa(s.id)} className="text-red-500 hover:text-red-400" title="Elimina">🗑️</button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {regime === 'ordinario' && (
                            <>
                                <label style={{ display: "block", marginTop: "1rem", marginBottom: "0.5rem", fontWeight: "600" }}>
                                    Scaglione IRPEF Sceglibile (Simulazione)
                                </label>
                                <div className="ios-select-group" style={{ marginBottom: "1rem" }}>
                                    <button
                                        className={`ios-segment ${scaglioneManuale === 23 ? 'active' : ''}`}
                                        onClick={() => setScaglioneManuale(23)}
                                    >23%</button>
                                    <button
                                        className={`ios-segment ${scaglioneManuale === 35 ? 'active' : ''}`}
                                        onClick={() => setScaglioneManuale(35)}
                                    >35%</button>
                                    <button
                                        className={`ios-segment ${scaglioneManuale === 43 ? 'active' : ''}`}
                                        onClick={() => setScaglioneManuale(43)}
                                    >43%</button>
                                </div>
                            </>
                        )}

                        <button className="ios-btn-large" onClick={calcolaManuale}>
                            Calcola Netto
                        </button>
                    </div>

                    {risultatoManuale && (
                        <div className="ios-card" style={{ marginTop: "1rem", background: "rgba(0,122,255,0.05)", borderColor: "var(--primary)" }}>
                            <h2 style={{ textAlign: "center", marginBottom: "1.5rem" }}>Risultato Simulato</h2>

                            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "1rem", borderBottom: "1px solid var(--border)", paddingBottom: "0.5rem" }}>
                                <span>Volume d&apos;Affari Lordo</span>
                                <span style={{ fontWeight: "600", color: "var(--foreground)" }}>€{risultatoManuale.volumeAffariLordo.toFixed(2)}</span>
                            </div>

                            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "1rem", borderBottom: "1px solid var(--border)", paddingBottom: "0.5rem" }}>
                                <span style={{ opacity: 0.8 }}>Compenso Base Inserito</span>
                                <span style={{ fontWeight: "600" }}>€{parseFloat(lordo).toFixed(2)}</span>
                            </div>

                            {regime !== 'free' && (
                                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "1rem", borderBottom: "1px solid var(--border)", paddingBottom: "0.5rem" }}>
                                    <span style={{ opacity: 0.8 }}>Imponibile Tassabile (Cassa Dedotta)</span>
                                    <span style={{ fontWeight: "600" }}>€{risultatoManuale.imponibile.toFixed(2)}</span>
                                </div>
                            )}

                            {regime === 'ordinario' && (
                                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "1rem", borderBottom: "1px solid var(--border)", paddingBottom: "0.5rem", color: "var(--primary)" }}>
                                    <span style={{ opacity: 0.8 }}>Spese Simulate Dedotte</span>
                                    <span style={{ fontWeight: "600" }}>- €{totaleSpeseSimulate.toFixed(2)}</span>
                                </div>
                            )}

                            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "1rem", borderBottom: "1px solid var(--border)", paddingBottom: "0.5rem", color: "var(--destructive)" }}>
                                <span>Tasse (IRPEF/Sostitutiva)</span>
                                <span style={{ fontWeight: "600" }}>- €{risultatoManuale.tasse.toFixed(2)}</span>
                            </div>

                            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "1rem", borderBottom: "1px solid var(--border)", paddingBottom: "0.5rem", color: "var(--destructive)" }}>
                                <span>Cassa Forense</span>
                                <span style={{ fontWeight: "600" }}>- €{risultatoManuale.cassa.toFixed(2)}</span>
                            </div>

                            <div style={{ display: "flex", justifyContent: "space-between", marginTop: "1.5rem", fontSize: "1.5rem" }}>
                                <strong>Netto Stimato</strong>
                                <strong style={{ color: "var(--success)" }}>€{risultatoManuale.netto.toFixed(2)}</strong>
                            </div>
                        </div>
                    )}
                </>
            )}

            {/* Modale Tutorial & Legenda */}
            {showTutorial && (
                <div style={{
                    position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: "rgba(0,0,0,0.5)", zIndex: 9999,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    padding: "1rem"
                }}>
                    <div className="ios-card" style={{
                        maxWidth: "500px", width: "100%", maxHeight: "80vh", overflowY: "auto",
                        position: "relative", animation: "slideUp 0.3s ease-out"
                    }}>
                        <button
                            onClick={() => setShowTutorial(false)}
                            style={{ position: "absolute", top: "1rem", right: "1rem", background: "none", border: "none", fontSize: "1.5rem", cursor: "pointer", color: "var(--foreground)" }}
                        >
                            ✕
                        </button>
                        <h2 style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1rem", color: "#007AFF" }}>
                            <Book size={24} /> Guida all&apos;App
                        </h2>

                        <div style={{ marginBottom: "1.5rem" }}>
                            <h3 style={{ fontSize: "1.1rem", marginBottom: "0.5rem" }}>Come utilizzare l&apos;App</h3>
                            <ul style={{ paddingLeft: "1.2rem", margin: 0, opacity: 0.9 }}>
                                <li><strong>Dashboard:</strong> Aggiungi qui le tue cause (entrate) e le tue spese (uscite). Scannerizza gli scontrini per un inserimento rapido.</li>
                                <li><strong>Cassetto Fiscale:</strong> Visualizza in automatico le tasse, la cassa forense e il netto in tasca, calcolati in base alle entrate e uscite registrate.</li>
                                <li><strong>Simulatore:</strong> Usa la sezione &quot;Simulatore&quot; per calcolare tasse e netto di un ipotetico incasso futuro, senza salvarlo nel database.</li>
                                <li><strong>Impostazioni:</strong> Configura il tuo regime fiscale e la cassa forense standard per i calcoli automatici.</li>
                            </ul>
                        </div>

                        <div style={{ background: "rgba(0,122,255,0.05)", padding: "1rem", borderRadius: "12px" }}>
                            <h3 style={{ fontSize: "1.1rem", marginBottom: "0.5rem" }}>Regime Ordinario: Spese Deducibili</h3>
                            <p style={{ fontSize: "0.9rem", opacity: 0.9, marginBottom: "0.5rem" }}>
                                Se sei nel regime Ordinario, l&apos;app abbatte automaticamente il tuo imponibile in base alla categoria della spesa:
                            </p>
                            <ul style={{ paddingLeft: "1.2rem", margin: 0, fontSize: "0.9rem" }}>
                                <li style={{ marginBottom: "4px" }}><strong>100% (Interamente deducibili):</strong> Cancelleria, Software, Spese per il Lavoro, Formazione. (Es: un PC o un corso).</li>
                                <li style={{ marginBottom: "4px" }}><strong>75% (Parzialmente deducibili):</strong> Ristoranti, Alberghi, Somministrazione alimenti e bevande per riunioni/trasferte.</li>
                                <li style={{ marginBottom: "4px" }}><strong>20% (Uso promiscuo):</strong> Auto, Trasporti, Carburante, Viaggi.</li>
                                <li><strong>0% (Non deducibili):</strong> Alimenti generici, spese personali, imprevisti.</li>
                            </ul>
                            <p style={{ fontSize: "0.85rem", opacity: 0.7, marginTop: "0.5rem", fontStyle: "italic" }}>
                                *Per il regime Forfettario le spese reali non si scaricano (esiste una deduzione forfettaria integrata del 15% o altra percentuale).
                            </p>
                        </div>
                    </div>
                </div>
            )}
            <style dangerouslySetInnerHTML={{
                __html: `
        @keyframes slideUp {
          from { transform: translateY(20px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}} />
        </div>
    );
}
