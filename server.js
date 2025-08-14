import express from "express";
import fetch from "node-fetch";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

// Variáveis de ambiente
const PINECONE_API_KEY = process.env.PINECONE_API_KEY;
const PINECONE_ENVIRONMENT = process.env.PINECONE_ENVIRONMENT;
const PINECONE_INDEX_NAME = process.env.PINECONE_INDEX_NAME;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const MODEL_NAME = process.env.MODEL_NAME || "mistralai/mistral-7b-instruct";

// Verifica se todas as variáveis estão definidas
if (!PINECONE_API_KEY || !PINECONE_ENVIRONMENT || !PINECONE_INDEX_NAME || !OPENROUTER_API_KEY) {
  console.error("⚠️ Variáveis de ambiente ausentes!");
}

// Função: buscar no Pinecone
async function buscarNoPinecone(queryVector) {
  if (!PINECONE_API_KEY || !PINECONE_ENVIRONMENT || !PINECONE_INDEX_NAME) return { matches: [] };
  
  const url = `https://${PINECONE_INDEX_NAME}-${PINECONE_ENVIRONMENT}.svc.pinecone.io/query`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Api-Key": PINECONE_API_KEY
    },
    body: JSON.stringify({
      vector: queryVector,
      topK: 3,
      includeMetadata: true
    })
  });
  return response.json();
}

// Função: gerar embedding
async function gerarEmbedding(text) {
  if (!OPENROUTER_API_KEY) return [];
  
  const response = await fetch("https://openrouter.ai/api/v1/embeddings", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "text-embedding-3-small",
      input: text
    })
  });
  const data = await response.json();
  return data.data?.[0]?.embedding || [];
}

// Função: gerar resposta com IA
async function gerarResposta(contexto, pergunta) {
  if (!OPENROUTER_API_KEY) return "Servidor sem chave OpenRouter configurada.";
  
  const prompt = `Baseado nas informações abaixo, responda de forma clara e objetiva:\n\n${contexto}\n\nPergunta: ${pergunta}`;
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: MODEL_NAME,
      messages: [{ role: "user", content: prompt }]
    })
  });
  const data = await response.json();
  return data.choices?.[0]?.message?.content || "Sem resposta";
}

// Rota de teste simples
app.get("/", (req, res) => {
  res.send("Servidor rodando no Render!");
});

// Rota principal do bot
app.post("/perguntar", async (req, res) => {
  try {
    const pergunta = req.body.pergunta;
    if (!pergunta) return res.status(400).json({ erro: "Pergunta não enviada." });

    const vector = await gerarEmbedding(pergunta);
    const resultados = await buscarNoPinecone(vector);

    const contexto = resultados.matches
      .map(m => m.metadata?.texto || "")
      .join("\n");

    const resposta = await gerarResposta(contexto, pergunta);
    res.json({ resposta });
  } catch (error) {
    console.error(error);
    res.status(500).json({ erro: "Erro ao processar a solicitação" });
  }
});

// Porta do Render
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
