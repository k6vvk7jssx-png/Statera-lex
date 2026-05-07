import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Parser from 'rss-parser';
import OpenAI from 'openai';

const openai = new OpenAI({
  baseURL: 'https://api.deepseek.com',
  apiKey: process.env.DEEPSEEK_API_KEY || "",
});

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(supabaseUrl, serviceRoleKey);
}

// Rss parser per leggere le notizie
const parser = new Parser();
const RSS_FEED_URL = 'https://www.fiscoetasse.com/rss.xml'; // Esempio di fonte attendibile

export async function GET(request: Request) {
  // Verifica l'autorizzazione: Vercel Cron invia un header specifico
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}` && process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // 1. Leggi il feed RSS
    const feed = await parser.parseURL(RSS_FEED_URL);
    
    // Prendi le prime 5 notizie
    const topNews = feed.items.slice(0, 5).map(item => `Titolo: ${item.title}\nContenuto: ${item.contentSnippet || item.content}\nLink: ${item.link}`).join('\n\n');

    // 2. Chiedi a DeepSeek di riassumerle e formattarle per il sistema
    const prompt = `
      Sei un assistente fiscale. Ho qui le ultime notizie estratte da un sito specializzato (Fisco e Tasse).
      Riassumi le novità più importanti in un elenco puntato chiaro e conciso. Concentrati in particolare su ciò che potrebbe interessare i liberi professionisti (avvocati) e le partite IVA.
      Non fare un'introduzione, restituisci solo l'elenco puntato.
      
      NOTIZIE:
      ${topNews}
    `;

    const completion = await openai.chat.completions.create({
      model: "deepseek-chat",
      messages: [{ role: "user", content: prompt }]
    });

    const summary = completion.choices[0].message.content || "Nessun aggiornamento estratto.";

    // 3. Salva nel database Supabase
    const supabase = getSupabaseAdmin();
    const { error } = await supabase
      .from('ai_knowledge_base')
      .insert({
        source: RSS_FEED_URL,
        content: topNews,
        summary: summary
      });

    if (error) {
      console.error("Errore salvataggio DB:", error);
      return NextResponse.json({ error: "DB Insert Failed", details: error }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: "Knowledge base updated successfully", summary });
  } catch (err) {
    console.error("Cron Update Error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
