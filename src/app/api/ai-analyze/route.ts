import OpenAI from "openai";
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createClient } from '@supabase/supabase-js';

const openai = new OpenAI({
  baseURL: 'https://api.deepseek.com',
  apiKey: process.env.DEEPSEEK_API_KEY || "",
});

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(supabaseUrl, serviceRoleKey);
}

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { financialData, messages } = await req.json();

    // 1. Recupera le ultime notizie (ignora l'errore se la tabella non esiste ancora)
    const supabase = getSupabaseAdmin();
    const { data: newsData, error: dbError } = await supabase
      .from('ai_knowledge_base')
      .select('summary')
      .order('created_at', { ascending: false })
      .limit(1);
    
    let latestNews = "";
    if (!dbError && newsData && newsData.length > 0 && newsData[0].summary) {
      latestNews = `\n\nAGGIORNAMENTI FISCALI RECENTI:\n${newsData[0].summary}`;
    }

    // 2. Costruisci il System Prompt
    const systemPrompt = `
      Sei StateraLex AI, un assistente fiscale virtuale e supporto tecnico per avvocati italiani.
      
      REGOLE DELL'APPLICAZIONE (StateraLex):
      - L'app gestisce entrate e uscite. Mostra un bilancio mensile e un riepilogo annuale.
      - "Netto Pulito" = Entrate - Fondo Tasse - Spese Affrontate.
      - "Fondo Tasse Virt." = Accantonamento calcolato in tempo reale per le tasse.
      - Forfettario: tasse calcolate sul 78% del lordo (non si deducono spese).
      - Ordinario: spese deducibili analiticamente (es. Auto 20%, Ristoranti 75%). Limite 2% per i ristoranti.
      - Cassa Forense: 17% (minimale ~3.600€ annui). L'app avvisa se il minimale non è raggiunto.
      
      IL TUO RUOLO:
      - Rispondi sempre in ITALIANO. Usa un tono professionale, chiaro ed empatico.
      - NON puoi modificare, cancellare o aggiungere dati. Sei in "sola lettura".
      - Puoi spiegare calcoli fiscali, analizzare la situazione mensile dell'utente o rispondere a dubbi legali.
      
      DATI ATTUALI DELL'UTENTE (Mese Corrente):
      - Regime: ${financialData?.regime || 'Sconosciuto'}
      - Entrate: €${financialData?.entrate || 0}
      - Uscite: €${financialData?.uscite || 0}
      - Tasse Accantonate: €${financialData?.tasse || 0}
      ${latestNews}
    `;

    // 3. Prepara lo storico dei messaggi
    const apiMessages: any[] = [
      { role: "system", content: systemPrompt }
    ];

    if (messages && Array.isArray(messages)) {
      apiMessages.push(...messages);
    } else {
      apiMessages.push({ role: "user", content: "Fammi un'analisi rapida e dammi 1 consiglio in base ai miei dati." });
    }

    const completion = await openai.chat.completions.create({
      model: "deepseek-chat", 
      messages: apiMessages,
    });

    const reply = completion.choices[0].message.content || "Nessuna risposta generata.";

    return NextResponse.json({ reply });
  } catch (error) {
    console.error("AI Analyze Error:", error);
    return NextResponse.json({ error: "Failed to analyze data" }, { status: 500 });
  }
}
