-- Tabelle per il Gestionale Avvocati
-- L'autenticazione è gestita da Clerk, quindi memorizziamo il `user_id` di Clerk come identificativo principale.

-- 1. Tabella Profilo Fiscale (opzionale, per memorizzare il regime scelto dall'utente)
CREATE TABLE IF NOT EXISTS public.profili (
  user_id TEXT PRIMARY KEY, 
  regime_fiscale TEXT NOT NULL DEFAULT 'forfettario_5', -- 'forfettario_5', 'forfettario_15', 'ordinario'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Tabella Transazioni (Entrate e Uscite)
-- Le entrate derivano anche dalle cause, le uscite sono spese.
CREATE TABLE IF NOT EXISTS public.transazioni (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('entrata', 'uscita')),
  importo NUMERIC(10, 2) NOT NULL,
  categoria TEXT, -- es: 'Salute', 'Lavoro', 'Tasse', 'Cause'
  descrizione TESTO,
  data_transazione DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Tabella Cause Legali
CREATE TABLE IF NOT EXISTS public.cause (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  nome_causa TEXT NOT NULL,
  data_sentenza DATE,
  compenso_lordo NUMERIC(10, 2) DEFAULT 0,
  stato TEXT DEFAULT 'aperta', -- 'aperta', 'vinta', 'persa', 'incassata'
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- HABILITAZIONE ROW LEVEL SECURITY (RLS)
ALTER TABLE public.profili ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transazioni ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cause ENABLE ROW LEVEL SECURITY;

-- POLICY PER RLS
-- Assumiamo che il token JWT passato da Clerk (o dal nostro server) contenga l'user_id come `request.jwt.claim.sub`
-- Questo richiede una funzione personalizzata o l'invio dell'ID utente verificato nel backend.
-- Nel nostro caso, essendo chiamate da Server Action/Vercel Serverless autenticate, possiamo basarci sull'user_id passato e validato,
-- Se si accede dal client Supabase JS, dovremo impostare custom JWT per Supabase tramite Clerk. 
-- Per semplicità e sicurezza al 100%, useremo chiamate Server-Side con la chiave di servizio per validare, MA per consentire
-- anche le chiamate client con il token Clerk, useremo questa definizione:

CREATE OR REPLACE FUNCTION requesting_user_id()
RETURNS TEXT AS $$
  -- Prende l'ID dal JWT custom che Clerk può generare per Supabase.
  SELECT NULLIF(current_setting('request.jwt.claims', true)::json->>'sub', '')::text;
$$ LANGUAGE SQL STABLE;

-- Profili
CREATE POLICY "Utenti possono vedere solo il proprio profilo" 
ON public.profili FOR SELECT USING (user_id = requesting_user_id());

CREATE POLICY "Utenti possono inserire il proprio profilo" 
ON public.profili FOR INSERT WITH CHECK (user_id = requesting_user_id());

CREATE POLICY "Utenti possono aggiornare il proprio profilo" 
ON public.profili FOR UPDATE USING (user_id = requesting_user_id());

-- Transazioni
CREATE POLICY "Utenti possono gestire le proprie transazioni" 
ON public.transazioni FOR ALL USING (user_id = requesting_user_id());

-- Cause
CREATE POLICY "Utenti possono gestire le proprie cause" 
ON public.cause FOR ALL USING (user_id = requesting_user_id());

-- 4. Tabella AI Knowledge Base (Aggiornamenti settimanali/mensili)
CREATE TABLE IF NOT EXISTS public.ai_knowledge_base (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL,
  content TEXT NOT NULL,
  summary TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
