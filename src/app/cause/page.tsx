"use client";

import React, { useState, useEffect } from "react";
import { useUser, useSession } from "@clerk/nextjs";
import { createClient } from "@supabase/supabase-js";
import { calculateInvoice } from "@/lib/taxCalculator";

// Inizializza Supabase Client (usiamo anon key per lato client protetto da RLS)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export default function Cause() {
    const { isLoaded, isSignedIn, user } = useUser();
    const { session } = useSession();
    const [showModal, setShowModal] = useState(false);

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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [causeList, setCauseList] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    // Stato del form
    const [nuovaCausa, setNuovaCausa] = useState({
        nome: "",
        compenso: "",
        data: new Date().toISOString().split('T')[0],
        tipologia_fiscale: "forfettario_15" as import("@/lib/taxCalculator").RegimeFiscale,
        applicaIva: false,
        applicaRitenuta: false,
        isOmnia: false,
        stato: "incassata" as "incassata" | "da_riscuotere"
    });

    const calculatedTaxes = React.useMemo(() => {
        let cLordo = parseFloat(nuovaCausa.compenso.replace(',', '.'));
        if (isNaN(cLordo) || cLordo <= 0) {
            return {
                compensoBase: 0, speseGenerali15: 0, cpa4: 0, iva22: 0, ritenutaAcconto20: 0, nettoCalcolato: 0, totaleFatturaLordo: 0
            };
        }
        
        if (nuovaCausa.isOmnia) {
            cLordo = cLordo / 1.196;
        }

        return calculateInvoice(
            cLordo,
            nuovaCausa.tipologia_fiscale,
            nuovaCausa.applicaIva,
            nuovaCausa.applicaRitenuta
        );
    }, [nuovaCausa.compenso, nuovaCausa.tipologia_fiscale, nuovaCausa.applicaIva, nuovaCausa.applicaRitenuta, nuovaCausa.isOmnia]);

    useEffect(() => {
        const savedRegime = localStorage.getItem("regime_fiscale_generale");
        if (savedRegime) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            setNuovaCausa(prev => ({ ...prev, tipologia_fiscale: savedRegime as any }));
        }

        if (isSignedIn && user) {
            loadCause();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isSignedIn, user]);

    const loadCause = async () => {
        try {
            const supabase = getSupabase();
            const { data, error } = await supabase
                .from('cause')
                .select('*')
                .eq('user_id', user?.id)
                .order('created_at', { ascending: false });

            if (error) throw error;

            // Mappiamo i dati restituiti dal DB con le proprietà usate dal componente React
            const mappedData = (data || []).map(c => ({
                id: c.id,
                nome: c.nome_causa,
                compenso: c.netto_calcolato > 0 ? c.netto_calcolato : c.compenso_lordo, // Mostra il netto a video
                data: c.data_sentenza,
                stato: c.stato
            }));
            setCauseList(mappedData);
        } catch (error) {
            console.error('Errore nel caricamento pratiche:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleAggiungiCausa = async () => {
        if (!nuovaCausa.nome || !nuovaCausa.compenso || !nuovaCausa.data) {
            alert("Compila tutti i campi obbligatori");
            return;
        }

        setIsSaving(true);
        try {
            // Payload allineato ESATTAMENTE alle colonne generate nello script SQL
            const dataToInsert = {
                user_id: user?.id,
                nome_causa: nuovaCausa.nome,
                compenso_lordo: calculatedTaxes.totaleFatturaLordo, // Il lordo totale in fattura
                compenso_base: calculatedTaxes.compensoBase,
                spese_generali_15: calculatedTaxes.speseGenerali15,
                cpa_4: calculatedTaxes.cpa4,
                iva_22: calculatedTaxes.iva22,
                ritenuta_acconto_20: calculatedTaxes.ritenutaAcconto20,
                netto_calcolato: calculatedTaxes.nettoCalcolato,
                data_sentenza: nuovaCausa.data,
                tipologia_fiscale: nuovaCausa.tipologia_fiscale,
                stato: nuovaCausa.stato
            };

            const supabase = getSupabase();
            const { error } = await supabase
                .from('cause')
                .insert([dataToInsert]);

            if (error) throw error;

            setShowModal(false);
            setNuovaCausa({
                nome: "",
                compenso: "",
                data: new Date().toISOString().split('T')[0],
                tipologia_fiscale: "forfettario_15",
                applicaIva: false,
                applicaRitenuta: false,
                isOmnia: false,
                stato: "incassata"
            });
            await loadCause();

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (error: any) {
            console.error('Errore nel salvataggio:', error);
            alert("Errore salva file: " + error.message);
        } finally {
            setIsSaving(false);
        }
    };

    const handleDeleteCausa = async (id: string, e: React.MouseEvent) => {
        // Previene l'apertura eventuale della causa se la riga intera fosse cliccabile
        e.stopPropagation();

        const confirmed = window.confirm("Sei sicuro di voler eliminare definitivamente questa registrazione?");
        if (!confirmed) return;

        setIsSaving(true);
        try {
            const supabase = getSupabase();
            const { error } = await supabase
                .from('cause')
                .delete()
                .eq('id', id)
                .eq('user_id', user?.id);

            if (error) throw error;

            // Ricarica la lista per mostrare la riga rimossa
            await loadCause();
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (error: any) {
            console.error('Errore nella cancellazione:', error);
            alert("Impossibile eliminare: " + error.message);
        } finally {
            setIsSaving(false);
        }
    };

    const handleToggleStato = async (id: string, currentStato: string) => {
        const newStato = currentStato === "incassata" ? "da_riscuotere" : "incassata";
        try {
            const supabase = getSupabase();
            const { error } = await supabase
                .from('cause')
                .update({ stato: newStato })
                .eq('id', id)
                .eq('user_id', user?.id);
            if (error) throw error;
            await loadCause();
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (error: any) {
            console.error('Errore aggiornamento stato:', error);
            alert("Errore: " + error.message);
        }
    };

    if (!isLoaded || !isSignedIn) return null;

    return (
        <div className="pb-20 relative min-h-screen">
            <div className="flex-row-between" style={{ marginBottom: "1rem" }}>
                <h1>Gestore Cause</h1>
                <button
                    className="ios-btn-small"
                    onClick={() => setShowModal(true)}
                    style={{ padding: "8px 12px", fontSize: "1.2rem", borderRadius: "50%", width: "40px", height: "40px", display: "flex", justifyContent: "center", alignItems: "center" }}
                >
                    +
                </button>
            </div>

            {isLoading ? (
                <div style={{ textAlign: "center", padding: "2rem", opacity: 0.5 }}>Caricamento archivio...</div>
            ) : causeList.length === 0 ? (
                <div style={{ textAlign: "center", padding: "2rem", opacity: 0.5 }}>
                    <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>⚖️</div>
                    Nessun compenso registrato. Premi il &quot;+&quot; in alto a destra per registrare la tua prima parcella o liquidazione.
                </div>
            ) : (
                causeList.map((causa) => (
                    <div key={causa.id} className="ios-card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderLeft: causa.stato === "da_riscuotere" ? "3px solid #FF9500" : "3px solid var(--success)" }}>
                        <div>
                            <h3 style={{ marginBottom: "4px" }}>
                                {causa.stato === "da_riscuotere" && <span title="Da riscuotere" style={{ color: "#FF9500", marginRight: "4px" }}>⚠️</span>}
                                {causa.nome}
                            </h3>
                            <span style={{ fontSize: "0.85rem", opacity: 0.6 }}>{causa.data}</span>
                        </div>
                        <div style={{ textAlign: "right", display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                                <div style={{ fontSize: "1.1rem", fontWeight: "600", color: causa.stato === "incassata" ? "var(--success)" : "#FF9500" }}>
                                    €{causa.compenso}{causa.stato === "da_riscuotere" ? "*" : ""}
                                </div>
                                <button
                                    onClick={(e) => handleDeleteCausa(causa.id, e)}
                                    style={{ background: "none", border: "none", color: "var(--destructive)", fontSize: "1.2rem", cursor: "pointer", padding: "5px" }}
                                    title="Elimina"
                                >
                                    🗑️
                                </button>
                            </div>
                            <button
                                onClick={(e) => { e.stopPropagation(); handleToggleStato(causa.id, causa.stato); }}
                                style={{
                                    fontSize: "0.75rem",
                                    padding: "4px 8px",
                                    borderRadius: "12px",
                                    background: causa.stato === "incassata" ? "rgba(52,199,89,0.1)" : "rgba(255,149,0,0.1)",
                                    color: causa.stato === "incassata" ? "var(--success)" : "#FF9500",
                                    textTransform: "uppercase",
                                    fontWeight: "600",
                                    marginTop: "5px",
                                    border: "none",
                                    cursor: "pointer"
                                }}
                            >
                                {causa.stato === "incassata" ? "✅ Incassata" : "⏳ Da Riscuotere"}
                            </button>
                        </div>
                    </div>
                ))
            )}

            {/* Spazio Vuoto */}
            <div style={{ height: "60px" }}></div>

            {/* Bottom Sheet Modale Nuova Causa */}
            {showModal && (
                <div style={{
                    position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
                    background: "rgba(0,0,0,0.5)", zIndex: 100,
                    display: "flex", flexDirection: "column", justifyContent: "flex-end"
                }}>
                    <div style={{
                        background: "var(--background)",
                        padding: "1.5rem",
                        borderTopLeftRadius: "20px",
                        borderTopRightRadius: "20px",
                        animation: "slideUp 0.3s ease-out",
                        maxHeight: "90vh",
                        overflowY: "auto"
                    }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "1.5rem" }}>
                            <button style={{ background: "none", border: "none", color: "var(--primary)", fontSize: "1.1rem", cursor: "pointer" }} onClick={() => setShowModal(false)}>Annulla</button>
                            <h3 style={{ margin: 0 }}>Nuova Entrata</h3>
                            <button style={{ background: "none", border: "none", color: "var(--primary)", fontWeight: "600", fontSize: "1.1rem", cursor: "pointer" }} onClick={handleAggiungiCausa}>Salva</button>
                        </div>

                        <input
                            type="text"
                            placeholder="Nome Causa / Cliente / Fattura"
                            className="ios-input"
                            value={nuovaCausa.nome}
                            onChange={(e) => setNuovaCausa({ ...nuovaCausa, nome: e.target.value })}
                        />
                        <input
                            type="date"
                            className="ios-input"
                            value={nuovaCausa.data}
                            onChange={(e) => setNuovaCausa({ ...nuovaCausa, data: e.target.value })}
                        />
                        
                        <div style={{ display: "flex", gap: "8px", marginTop: "0.75rem" }}>
                            <button
                                onClick={() => setNuovaCausa({ ...nuovaCausa, stato: "incassata" })}
                                style={{
                                    flex: 1, padding: "10px", borderRadius: "12px", border: "none", cursor: "pointer", fontWeight: "600", fontSize: "0.85rem",
                                    background: nuovaCausa.stato === "incassata" ? "rgba(52,199,89,0.2)" : "rgba(128,128,128,0.1)",
                                    color: nuovaCausa.stato === "incassata" ? "var(--success)" : "inherit",
                                    outline: nuovaCausa.stato === "incassata" ? "2px solid var(--success)" : "none"
                                }}
                            >
                                ✅ Incassata
                            </button>
                            <button
                                onClick={() => setNuovaCausa({ ...nuovaCausa, stato: "da_riscuotere" })}
                                style={{
                                    flex: 1, padding: "10px", borderRadius: "12px", border: "none", cursor: "pointer", fontWeight: "600", fontSize: "0.85rem",
                                    background: nuovaCausa.stato === "da_riscuotere" ? "rgba(255,149,0,0.2)" : "rgba(128,128,128,0.1)",
                                    color: nuovaCausa.stato === "da_riscuotere" ? "#FF9500" : "inherit",
                                    outline: nuovaCausa.stato === "da_riscuotere" ? "2px solid #FF9500" : "none"
                                }}
                            >
                                ⏳ Da Riscuotere
                            </button>
                        </div>

                        <p style={{ marginTop: "1rem", marginBottom: "0.25rem", fontSize: "0.9rem", fontWeight: "600" }}>
                            Compenso Lordo Concordato (€)
                        </p>
                        <input
                            type="number"
                            placeholder="Es. 1000"
                            className="ios-input"
                            value={nuovaCausa.compenso}
                            onChange={(e) => setNuovaCausa({ ...nuovaCausa, compenso: e.target.value })}
                        />
                        
                        <div className="ios-card" style={{ marginTop: "0.5rem", padding: "10px", backgroundColor: "var(--background)" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                <div style={{ display: "flex", flexDirection: "column" }}>
                                    <span style={{ fontSize: "0.9rem", fontWeight: "600" }}>Fattura Omnia</span>
                                    <span style={{ fontSize: "0.75rem", opacity: 0.6 }}>Importo già comprensivo di CPA e 15%</span>
                                </div>
                                <input
                                    type="checkbox"
                                    checked={nuovaCausa.isOmnia}
                                    onChange={(e) => setNuovaCausa({ ...nuovaCausa, isOmnia: e.target.checked })}
                                    style={{ transform: "scale(1.2)" }}
                                />
                            </div>
                        </div>

                        <label style={{ display: "block", marginBottom: "0.5rem", fontSize: "0.9rem", opacity: 0.7, marginTop: "1rem" }}>Regime Fiscale Applicato</label>
                        <select
                            className="ios-input"
                            style={{ appearance: "none" }}
                            value={nuovaCausa.tipologia_fiscale}
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            onChange={(e) => setNuovaCausa({ ...nuovaCausa, tipologia_fiscale: e.target.value as any })}
                        >
                            <option value="forfettario_5">Forfettario 5%</option>
                            <option value="forfettario_15">Forfettario 15%</option>
                            <option value="ordinario">Ordinario</option>
                            <option value="free">Lavoro Autonomo Occasionale / Esente</option>
                        </select>

                        {/* Modulo Adattivo per Ordinario */}
                        {nuovaCausa.tipologia_fiscale === "ordinario" && (
                            <div className="ios-card" style={{ marginTop: "1rem", padding: "10px", backgroundColor: "var(--background)" }}>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                                    <span style={{ fontSize: "0.9rem", fontWeight: "500" }}>Applica IVA 22%</span>
                                    <input
                                        type="checkbox"
                                        checked={nuovaCausa.applicaIva}
                                        onChange={(e) => setNuovaCausa({ ...nuovaCausa, applicaIva: e.target.checked })}
                                        style={{ transform: "scale(1.2)" }}
                                    />
                                </div>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                    <span style={{ fontSize: "0.9rem", fontWeight: "500" }}>Applica Ritenuta 20%</span>
                                    <input
                                        type="checkbox"
                                        checked={nuovaCausa.applicaRitenuta}
                                        onChange={(e) => setNuovaCausa({ ...nuovaCausa, applicaRitenuta: e.target.checked })}
                                        style={{ transform: "scale(1.2)" }}
                                    />
                                </div>
                            </div>
                        )}

                        {/* Riepilogo Calcoli */}
                        {parseFloat(nuovaCausa.compenso) > 0 && (
                            <div className="ios-card" style={{ marginTop: "1rem", backgroundColor: "rgba(0,122,255,0.05)", border: "1px solid var(--primary)" }}>
                                <h4 style={{ margin: "0 0 10px 0", fontSize: "0.95rem" }}>Riepilogo Fattura O.D.A.</h4>
                                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem", opacity: 0.8 }}>
                                    <span>Compenso:</span>
                                    <span>€{calculatedTaxes.compensoBase.toFixed(2)}</span>
                                </div>
                                {calculatedTaxes.speseGenerali15 > 0 && (
                                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem", opacity: 0.8 }}>
                                        <span>Spese Generali 15%:</span>
                                        <span>+€{calculatedTaxes.speseGenerali15.toFixed(2)}</span>
                                    </div>
                                )}
                                {calculatedTaxes.cpa4 > 0 && (
                                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem", opacity: 0.8 }}>
                                        <span>CPA 4%:</span>
                                        <span>+€{calculatedTaxes.cpa4.toFixed(2)}</span>
                                    </div>
                                )}
                                {calculatedTaxes.iva22 > 0 && (
                                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem", opacity: 0.8 }}>
                                        <span>IVA 22%:</span>
                                        <span>+€{calculatedTaxes.iva22.toFixed(2)}</span>
                                    </div>
                                )}
                                {calculatedTaxes.ritenutaAcconto20 > 0 && (
                                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem", color: "var(--destructive)" }}>
                                        <span>Ritenuta 20%:</span>
                                        <span>-€{calculatedTaxes.ritenutaAcconto20.toFixed(2)}</span>
                                    </div>
                                )}
                                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "1.1rem", fontWeight: "bold", marginTop: "10px", paddingTop: "5px", borderTop: "1px solid rgba(0,0,0,0.1)" }}>
                                    <span>Netto in Fattura:</span>
                                    <span style={{ color: "var(--success)" }}>€{calculatedTaxes.nettoCalcolato.toFixed(2)}</span>
                                </div>
                            </div>
                        )}

                        <button
                            className="ios-btn-large"
                            style={{ marginTop: "1rem" }}
                            onClick={handleAggiungiCausa}
                            disabled={isSaving}
                        >
                            {isSaving ? "Salvataggio in corso..." : "Registra Entrata"}
                        </button>
                    </div>
                </div>
            )}

            {/* Animazione inline per il modale */}
            <style dangerouslySetInnerHTML={{
                __html: `
        @keyframes slideUp {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
      `}} />
        </div>
    );
}
