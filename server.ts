/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from 'express';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import path from 'path';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const app = express();
const port = parseInt(process.env.PORT || '3000', 10);

app.use(express.json({ limit: '10mb' }));

// Initialisation du client Google GenAI par défaut avec la clé serveur si présente
function getGeminiClient(customApiKey?: string): GoogleGenAI | null {
  const key = customApiKey?.trim() || process.env.GEMINI_API_KEY;
  if (!key) return null;
  return new GoogleGenAI({
    apiKey: key,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

/**
 * Appel générique à l'API Google Gemini
 */
async function callGemini(
  prompt: string,
  systemInstruction: string,
  modelName: string,
  customApiKey?: string,
  temperature: number = 0.2
): Promise<string> {
  const client = getGeminiClient(customApiKey);
  if (!client) {
    throw new Error(
      "Aucune clé API Gemini n'a été fournie et la variable d'environnement GEMINI_API_KEY est absente."
    );
  }

  const response = await client.models.generateContent({
    model: modelName || 'gemini-3.8-flash',
    contents: prompt,
    config: {
      systemInstruction,
      responseMimeType: 'application/json',
      temperature,
    },
  });

  const text = response.text;
  if (!text) {
    throw new Error('Réponse vide retournée par le modèle Gemini.');
  }
  return text;
}

/**
 * Détermine si une configuration doit être routée vers le protocole Anthropic Messages
 * (obligatoire pour CommandCode AI, le modèle glm-5.3-flash, Claude ou si apiFormat === 'anthropic')
 */
function isAnthropicFormat(params: {
  provider?: string;
  apiFormat?: string;
  model?: string;
  baseUrl?: string;
}): boolean {
  if (params.apiFormat === 'anthropic') return true;
  if (params.apiFormat === 'openai' || params.apiFormat === 'direct') return false;
  if (params.provider === 'anthropic' || params.provider === 'commandcode') return true;
  const m = (params.model || '').toLowerCase();
  const u = (params.baseUrl || '').toLowerCase();
  if (m.includes('glm-5') || m.includes('claude')) return true;
  if (u.includes('commandcode.ai') || u.endsWith('/messages')) return true;
  return false;
}

/**
 * Appel générique pour tous les fournisseurs compatibles avec le protocole OpenAI
 * (OpenAI, Groq, DeepSeek, Mistral, Ollama, LM Studio, etc.)
 */
async function callOpenAICompatible(params: {
  baseUrl: string;
  apiKey?: string;
  model: string;
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
  apiFormat?: 'openai' | 'anthropic' | 'direct';
}): Promise<string> {
  const { baseUrl, apiKey, model, systemPrompt, userPrompt, temperature = 0.2, apiFormat = 'openai' } = params;

  let endpoint = (baseUrl || 'https://api.openai.com/v1').trim();
  if (apiFormat !== 'direct') {
    const cleanBase = endpoint.replace(/\/+$/, '');
    endpoint = cleanBase.endsWith('/chat/completions') ? cleanBase : `${cleanBase}/chat/completions`;
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (apiKey && apiKey.trim()) {
    headers['Authorization'] = `Bearer ${apiKey.trim()}`;
  }

  const payload: any = {
    model: model || 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature,
    response_format: { type: 'json_object' },
  };

  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    let parsedError = errorText;
    try {
      const jsonErr = JSON.parse(errorText);
      parsedError = jsonErr.error?.message || jsonErr.message || errorText;
    } catch {
      // keep raw string
    }
    throw new Error(`Erreur API (${response.status}) : ${parsedError}`);
  }

  const data: any = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('Aucun contenu textuel dans la réponse reçue.');
  }
  return content;
}

/**
 * Appel spécifique au protocole Anthropic Messages API
 * (Anthropic Claude, CommandCode AI pour glm-5.3-flash, proxies Anthropic-compatibles)
 */
async function callAnthropic(params: {
  baseUrl: string;
  apiKey?: string;
  model: string;
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
}): Promise<string> {
  const { baseUrl, apiKey, model, systemPrompt, userPrompt, temperature = 0.2 } = params;
  const key = apiKey?.trim() || process.env.COMMANDCODE_API_KEY || process.env.ANTHROPIC_API_KEY;
  if (!key) {
    throw new Error('Aucune clé API fournie pour le protocole Anthropic Messages (CommandCode / Claude).');
  }

  const cleanBase = (baseUrl || 'https://api.anthropic.com/v1').trim().replace(/\/+$/, '');

  // URLs candidates pour l'endpoint Messages sans forcer /chat/completions
  const candidateEndpoints: string[] = [];
  if (cleanBase.endsWith('/messages')) {
    candidateEndpoints.push(cleanBase);
  } else if (cleanBase.endsWith('/v1')) {
    candidateEndpoints.push(`${cleanBase}/messages`);
  } else {
    // Si l'utilisateur saisit https://commandcode.ai, tester https://commandcode.ai/messages et https://commandcode.ai/v1/messages
    candidateEndpoints.push(`${cleanBase}/messages`);
    candidateEndpoints.push(`${cleanBase}/v1/messages`);
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-api-key': key,
    'Authorization': `Bearer ${key}`,
    'anthropic-version': '2023-06-01',
  };

  const payload = {
    model: model || 'glm-5.3-flash',
    max_tokens: 4096,
    system: `${systemPrompt}\nTu dois impérativement répondre UNIQUEMENT avec un objet JSON valide, sans aucune phrase de politesse ni bloc markdown \`\`\`json.`,
    messages: [{ role: 'user', content: userPrompt }],
    temperature,
  };

  let response: Response | null = null;
  let lastErrorText = '';
  let lastStatus = 0;

  for (const endpoint of candidateEndpoints) {
    try {
      const resp = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });

      if (resp.status === 404 || resp.status === 405) {
        lastStatus = resp.status;
        lastErrorText = await resp.text();
        continue;
      }

      response = resp;
      break;
    } catch (err: any) {
      if (candidateEndpoints.indexOf(endpoint) === candidateEndpoints.length - 1) {
        throw new Error(`Erreur réseau vers ${endpoint} : ${err?.message || err}`);
      }
    }
  }

  if (!response) {
    throw new Error(`Échec de connexion (HTTP ${lastStatus}) sur les endpoints Anthropic Messages : ${lastErrorText}`);
  }

  if (!response.ok) {
    const errorText = await response.text();
    let parsedError = errorText;
    try {
      const jsonErr = JSON.parse(errorText);
      parsedError = jsonErr.error?.message || jsonErr.message || errorText;
    } catch {
      // ignore
    }
    throw new Error(`Erreur Anthropic / CommandCode (${response.status}) : ${parsedError}`);
  }

  const data: any = await response.json();
  let text = '';
  if (Array.isArray(data.content)) {
    text = data.content.map((c: any) => (typeof c === 'string' ? c : c.text || '')).join('');
  } else if (typeof data.content === 'string') {
    text = data.content;
  } else if (data.choices?.[0]?.message?.content) {
    text = data.choices[0].message.content;
  } else if (typeof data.text === 'string') {
    text = data.text;
  } else if (data.message?.content) {
    text = typeof data.message.content === 'string' ? data.message.content : JSON.stringify(data.message.content);
  }

  if (!text) {
    throw new Error('Réponse vide ou format inattendu reçu du serveur Anthropic / CommandCode.');
  }
  return text;
}

/**
 * Nettoyage et parsing JSON robuste pour extraire du JSON même si le modèle renvoie du markdown
 */
function cleanAndParseJSON(rawText: string): any {
  let cleaned = rawText.trim();
  // Suppression des blocs markdown éventuels
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.replace(/^```json\s*/i, '').replace(/\s*```$/, '');
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```\s*/, '').replace(/\s*```$/, '');
  }
  return JSON.parse(cleaned);
}

/**
 * Route POST /api/ai/test-provider
 * Permet de tester en direct la connectivité, la clé et le modèle d'un provider
 */
app.post('/api/ai/test-provider', async (req, res) => {
  const startTime = Date.now();
  const { provider = 'google', apiKey, model, baseUrl, temperature = 0.2, apiFormat } = req.body;

  const testSystemPrompt =
    'Tu es un vérificateur de connectivité IA pour un logiciel scolaire. Réponds exclusivement avec un JSON valide : {"status": "ok", "provider": "nom", "message": "Connexion opérationnelle"}.';
  const testUserPrompt = 'Effectue le test de connexion et renvoie l\'objet JSON.';

  try {
    let rawResult = '';
    const selectedModel = model || (provider === 'commandcode' ? 'glm-5.3-flash' : 'gemini-3.8-flash');

    // Vérifier si ce provider doit être traité via le protocole Anthropic Messages
    const useAnthropic =
      provider === 'commandcode' ||
      provider === 'anthropic' ||
      isAnthropicFormat({ provider, apiFormat, model: selectedModel, baseUrl });

    if (useAnthropic) {
      const key =
        apiKey?.trim() ||
        (provider === 'commandcode' ? process.env.COMMANDCODE_API_KEY : process.env.ANTHROPIC_API_KEY);
      if (!key) {
        throw new Error(
          provider === 'commandcode'
            ? 'Veuillez renseigner votre clé API CommandCode.'
            : 'Veuillez renseigner votre clé API Anthropic (sk-ant-...).'
        );
      }
      rawResult = await callAnthropic({
        baseUrl: baseUrl || (provider === 'commandcode' ? 'https://commandcode.ai' : 'https://api.anthropic.com/v1'),
        apiKey: key,
        model: selectedModel || 'glm-5.3-flash',
        systemPrompt: testSystemPrompt,
        userPrompt: testUserPrompt,
        temperature,
      });
    } else {
      switch (provider) {
        case 'google': {
          rawResult = await callGemini(
            testUserPrompt,
            testSystemPrompt,
            selectedModel,
            apiKey,
            temperature
          );
          break;
        }

        case 'openai': {
          const key = apiKey?.trim() || process.env.OPENAI_API_KEY;
          if (!key) {
            throw new Error('Veuillez renseigner votre clé API OpenAI (sk-...).');
          }
          rawResult = await callOpenAICompatible({
            baseUrl: baseUrl || 'https://api.openai.com/v1',
            apiKey: key,
            model: selectedModel || 'gpt-4o-mini',
            systemPrompt: testSystemPrompt,
            userPrompt: testUserPrompt,
            temperature,
            apiFormat: apiFormat || 'openai',
          });
          break;
        }

        case 'groq': {
          const key = apiKey?.trim() || process.env.GROQ_API_KEY;
          if (!key) {
            throw new Error('Veuillez renseigner votre clé API Groq (gsk_...).');
          }
          rawResult = await callOpenAICompatible({
            baseUrl: baseUrl || 'https://api.groq.com/openai/v1',
            apiKey: key,
            model: selectedModel || 'llama-3.3-70b-versatile',
            systemPrompt: testSystemPrompt,
            userPrompt: testUserPrompt,
            temperature,
            apiFormat: apiFormat || 'openai',
          });
          break;
        }

        case 'deepseek': {
          const key = apiKey?.trim() || process.env.DEEPSEEK_API_KEY;
          if (!key) {
            throw new Error('Veuillez renseigner votre clé API DeepSeek.');
          }
          rawResult = await callOpenAICompatible({
            baseUrl: baseUrl || 'https://api.deepseek.com',
            apiKey: key,
            model: selectedModel || 'deepseek-chat',
            systemPrompt: testSystemPrompt,
            userPrompt: testUserPrompt,
            temperature,
            apiFormat: apiFormat || 'openai',
          });
          break;
        }

        case 'mistral': {
          const key = apiKey?.trim() || process.env.MISTRAL_API_KEY;
          if (!key) {
            throw new Error('Veuillez renseigner votre clé API Mistral.');
          }
          rawResult = await callOpenAICompatible({
            baseUrl: baseUrl || 'https://api.mistral.ai/v1',
            apiKey: key,
            model: selectedModel || 'mistral-small-latest',
            systemPrompt: testSystemPrompt,
            userPrompt: testUserPrompt,
            temperature,
            apiFormat: apiFormat || 'openai',
          });
          break;
        }

        case 'openrouter': {
          const key = apiKey?.trim() || process.env.OPENROUTER_API_KEY;
          if (!key) {
            throw new Error('Veuillez renseigner votre clé API OpenRouter (sk-or-...).');
          }
          rawResult = await callOpenAICompatible({
            baseUrl: baseUrl || 'https://openrouter.ai/api/v1',
            apiKey: key,
            model: selectedModel || 'openai/gpt-4o-mini',
            systemPrompt: testSystemPrompt,
            userPrompt: testUserPrompt,
            temperature,
            apiFormat: apiFormat || 'openai',
          });
          break;
        }

        case 'custom': {
          rawResult = await callOpenAICompatible({
            baseUrl: baseUrl || 'http://localhost:11434/v1',
            apiKey: apiKey || 'dummy',
            model: selectedModel || 'llama3:latest',
            systemPrompt: testSystemPrompt,
            userPrompt: testUserPrompt,
            temperature,
            apiFormat: apiFormat || 'openai',
          });
          break;
        }

        case 'heuristic': {
          return res.json({
            success: true,
            message: 'Moteur heuristique intégré prêt (100% autonome).',
            latencyMs: 5,
            modelUsed: 'Règles expertes locales',
          });
        }

        default: {
          if (provider.startsWith('custom') || baseUrl) {
            rawResult = await callOpenAICompatible({
              baseUrl: baseUrl || 'http://localhost:11434/v1',
              apiKey: apiKey || 'dummy',
              model: selectedModel || 'llama3',
              systemPrompt: testSystemPrompt,
              userPrompt: testUserPrompt,
              temperature,
              apiFormat: apiFormat || 'openai',
            });
            break;
          }
          throw new Error(`Fournisseur d'IA inconnu : ${provider}`);
        }
      }
    }

    const elapsed = Date.now() - startTime;
    return res.json({
      success: true,
      message: `Connexion établie avec succès avec ${selectedModel} (${elapsed} ms)`,
      latencyMs: elapsed,
      modelUsed: selectedModel,
      snippet: rawResult.slice(0, 150),
    });
  } catch (error: any) {
    const elapsed = Date.now() - startTime;
    console.warn(`[test-provider] Échec pour ${provider}:`, error?.message || error);
    return res.status(400).json({
      success: false,
      error: error?.message || 'Erreur lors du test de connexion au fournisseur IA',
      latencyMs: elapsed,
    });
  }
});

/**
 * Route API de recommandation IA pour relâcher les contraintes
 * et atteindre 100 % d'insertion des matières non affectées.
 * Prend en charge n'importe quel provider externe configuré (Gemini, OpenAI, Claude, Groq, DeepSeek, Mistral, Local).
 */
app.post('/api/ai/recommend-relaxations', async (req, res) => {
  const startTime = Date.now();
  try {
    const {
      unplacedUnits = [],
      totalHours = 0,
      placedHours = 0,
      insertionRate = 0,
      currentConstraints = {},
      diagnosticReports = [],
      providerConfig,
    } = req.body;

    const providerId = providerConfig?.id || 'google';
    const customApiKey = providerConfig?.apiKey;
    const modelName =
      providerConfig?.model ||
      (providerId === 'google'
        ? 'gemini-3.8-flash'
        : providerId === 'commandcode'
        ? 'glm-5.3-flash'
        : 'gpt-4o-mini');
    const baseUrl = providerConfig?.baseUrl;
    const temperature = providerConfig?.temperature ?? 0.2;
    const apiFormat = providerConfig?.apiFormat;

    // Si aucune matière non affectée
    if (!unplacedUnits || unplacedUnits.length === 0) {
      return res.json({
        summary: "Toutes les matières sont déjà 100 % affectées dans l'emploi du temps !",
        predictedSuccessRate: 100,
        recommendations: [],
        engineMetadata: {
          providerId,
          providerName: providerConfig?.name || 'IA',
          model: modelName,
          latencyMs: Date.now() - startTime,
          isFallback: false,
        },
      });
    }

    // Prompt contextuel détaillé
    const systemInstruction = `Tu es un expert mondial en recherche opérationnelle et en planification scolaire pour les collèges et lycées.
Ton objectif absolu est de permettre un TAUX D'INSERTION DE 100% de toutes les matières en analysant les matières/unités non affectées et en proposant des assouplissements ciblés de contraintes (relâcher une ou des contraintes spécifiques).

Règles de génération des recommandations :
1. Chaque recommandation doit être concrète, pragmatique et directement applicable sous forme de "patch" de configuration.
2. Catégories de relâchement possibles :
   - BLOCKS : Autoriser des séances de 3h par jour pour une matière lourde (ex: 7h hebdo sur 3 jours dispo), ou passer une matière en séances libres (1h ou 2h ou 3h), ou modifier 'maxHeuresParJourParMatiere'.
   - FORBIDDEN_SLOTS : Supprimer ou désactiver des créneaux interdits qui bloquent une classe ou un professeur critique.
   - DAILY_LIMIT : Augmenter 'maxHeuresParJourProf' (passer par ex de 6h à 7h) ou 'maxHeuresParJourUnite' (passer de 2h à 3h).
   - PAUSE_MIDI : Assouplir l'interdiction de chevauchement de la pause méridienne pour les blocs ('respecterPauseMidiBlocs': false).
   - RELAXED_MODE : Activer le mode règles souples relâchées ('relaxedMode': true) pour autoriser le solveur à prioriser le placement à 100% sur le confort.
3. Renvoyer impérativement un JSON valide respectant la structure demandée.`;

    const userPrompt = `Voici la situation actuelle de l'emploi du temps :
- Taux d'insertion actuel : ${insertionRate}% (${placedHours}h placées sur ${totalHours}h au total).
- Nombre d'heures non affectées : ${totalHours - placedHours}h.

Matières / Unités NON AFFECTÉES (incomplètes) :
${JSON.stringify(unplacedUnits, null, 2)}

Diagnostic d'infaisabilité détecté :
${JSON.stringify(diagnosticReports, null, 2)}

Contraintes actuelles :
${JSON.stringify(currentConstraints, null, 2)}

Propose une liste ordonnée de recommandations IA pour débloquer ces matières et atteindre 100% d'insertion.
Réponds EXCLUSIVEMENT sous forme d'un objet JSON au format :
{
  "summary": "Explication claire en 2-3 phrases de la raison des blocages et du plan d'action recommandé",
  "predictedSuccessRate": 100,
  "recommendations": [
    {
      "id": "rec_1",
      "category": "BLOCKS" | "DAILY_LIMIT" | "FORBIDDEN_SLOTS" | "PAUSE_MIDI" | "RELAXED_MODE",
      "title": "Titre clair de la recommandation (ex: Autoriser jusqu'à 3h par jour pour les Mathématiques)",
      "reasoning": "Explication pédagogique de pourquoi ce relâchement permet d'insérer les heures manquantes",
      "impactHours": 4,
      "patch": {
        "relaxedMode": true
      }
    }
  ]
}`;

    let parsedResult: any = null;
    let executionError: string | null = null;

    if (providerId !== 'heuristic') {
      try {
        let rawOutput = '';
        if (providerId === 'google') {
          rawOutput = await callGemini(
            userPrompt,
            systemInstruction,
            modelName,
            customApiKey,
            temperature
          );
        } else if (
          providerId === 'commandcode' ||
          providerId === 'anthropic' ||
          isAnthropicFormat({ provider: providerId, apiFormat, model: modelName, baseUrl })
        ) {
          const effectiveBaseUrl =
            baseUrl ||
            (providerId === 'commandcode' ? 'https://commandcode.ai' : 'https://api.anthropic.com/v1');
          const effectiveKey =
            customApiKey?.trim() ||
            (providerId === 'commandcode'
              ? process.env.COMMANDCODE_API_KEY
              : process.env.ANTHROPIC_API_KEY);

          rawOutput = await callAnthropic({
            baseUrl: effectiveBaseUrl,
            apiKey: effectiveKey,
            model: modelName,
            systemPrompt: systemInstruction,
            userPrompt,
            temperature,
          });
        } else if (
          providerId === 'openai' ||
          providerId === 'groq' ||
          providerId === 'deepseek' ||
          providerId === 'mistral' ||
          providerId === 'openrouter' ||
          providerId === 'custom' ||
          providerId.startsWith('custom')
        ) {
          const effectiveBaseUrl =
            baseUrl ||
            (providerId === 'openai'
              ? 'https://api.openai.com/v1'
              : providerId === 'groq'
              ? 'https://api.groq.com/openai/v1'
              : providerId === 'deepseek'
              ? 'https://api.deepseek.com'
              : providerId === 'mistral'
              ? 'https://api.mistral.ai/v1'
              : providerId === 'openrouter'
              ? 'https://openrouter.ai/api/v1'
              : 'http://localhost:11434/v1');

          const effectiveKey =
            customApiKey?.trim() ||
            (providerId === 'openai'
              ? process.env.OPENAI_API_KEY
              : providerId === 'groq'
              ? process.env.GROQ_API_KEY
              : providerId === 'deepseek'
              ? process.env.DEEPSEEK_API_KEY
              : providerId === 'mistral'
              ? process.env.MISTRAL_API_KEY
              : providerId === 'openrouter'
              ? process.env.OPENROUTER_API_KEY
              : 'dummy');

          rawOutput = await callOpenAICompatible({
            baseUrl: effectiveBaseUrl,
            apiKey: effectiveKey,
            model: modelName,
            systemPrompt: systemInstruction,
            userPrompt,
            temperature,
            apiFormat: apiFormat || 'openai',
          });
        }

        if (rawOutput) {
          parsedResult = cleanAndParseJSON(rawOutput);
        }
      } catch (err: any) {
        executionError = err?.message || String(err);
        console.warn(
          `[recommend-relaxations] Échec de l'appel au provider ${providerId} (${modelName}), bascule sur l'heuristique experte:`,
          executionError
        );
      }
    }

    if (parsedResult && Array.isArray(parsedResult.recommendations) && parsedResult.recommendations.length > 0) {
      return res.json({
        summary: parsedResult.summary,
        predictedSuccessRate: parsedResult.predictedSuccessRate || 100,
        recommendations: parsedResult.recommendations,
        engineMetadata: {
          providerId,
          providerName: providerConfig?.name || providerId,
          model: modelName,
          latencyMs: Date.now() - startTime,
          isFallback: false,
        },
      });
    }

    // Heuristique experte de secours (Fallback automatique & résilient)
    const fallbackRecommendations: any[] = [];
    const missingTotal = totalHours - placedHours;

    // 1. Détection des matières bloquées par la contrainte de blocs ou la limite de 2h/jour
    const matieresBloquees: string[] = Array.from(
      new Set<string>(
        unplacedUnits.map((u: any) => String(u.matiere || u.subject || '')).filter(Boolean)
      )
    );
    for (const mat of matieresBloquees) {
      fallbackRecommendations.push({
        id: `rec_block_${mat}`,
        category: 'BLOCKS',
        title: `Autoriser des blocs jusqu'à 3h par jour pour « ${mat} »`,
        reasoning: `La matière ${mat} subit une congestion sur les créneaux disponibles. Permettre des blocs de 3h consécutives (au lieu de 2h max) permet de regrouper les heures et de débloquer les créneaux résiduels.`,
        impactHours: Math.min(3, missingTotal),
        patch: {
          maxHeuresParJourParMatiere: {
            ...(currentConstraints.maxHeuresParJourParMatiere || {}),
            [mat]: 3,
          },
        },
      });
    }

    // 2. Mode relâché global
    if (!currentConstraints.relaxedMode) {
      fallbackRecommendations.push({
        id: 'rec_relaxed_mode',
        category: 'RELAXED_MODE',
        title: "Activer le mode « Règles souples relâchées » pour le solveur",
        reasoning:
          "Assouplit les pénalités de confort (compacité et dispersions) pour que le solveur se concentre à 100% sur l'insertion de toutes les heures sans contrainte de compacité stricte.",
        impactHours: missingTotal,
        patch: {
          relaxedMode: true,
        },
      });
    }

    // 3. Augmentation du plafond journalier par prof si applicable
    const currentMaxProf = currentConstraints.maxHeuresParJourProf ?? 6;
    if (currentMaxProf < 8) {
      fallbackRecommendations.push({
        id: 'rec_max_prof',
        category: 'DAILY_LIMIT',
        title: `Étendre le plafond enseignant à ${currentMaxProf + 1}h par jour (actuellement ${currentMaxProf}h)`,
        reasoning: `Certains enseignants des matières non affectées atteignent leur quota journalier de ${currentMaxProf}h sur les jours où leurs classes sont libres. Passer à ${currentMaxProf + 1}h offre des ouvertures immédiates.`,
        impactHours: 2,
        patch: {
          maxHeuresParJourProf: currentMaxProf + 1,
        },
      });
    }

    // 4. Assouplissement des plages interdites si existantes
    const forbiddenCount =
      (currentConstraints.forbiddenSlotsClasses?.length || 0) +
      (currentConstraints.forbiddenSlotsTeachers?.length || 0);
    if (forbiddenCount > 0) {
      fallbackRecommendations.push({
        id: 'rec_forbidden_slots',
        category: 'FORBIDDEN_SLOTS',
        title: `Désactiver temporairement les plages interdites (${forbiddenCount} créneau(x) bloqué(s))`,
        reasoning:
          "Les plages interdites réduisent drastiquement l'espace de recherche sur les classes ou professeurs concernés. Leur levée temporaire élimine les verrous d'incompatibilité horaire.",
        impactHours: Math.min(forbiddenCount, missingTotal),
        patch: {
          forbiddenSlotsClasses: [],
          forbiddenSlotsTeachers: [],
        },
      });
    }

    // 5. Assouplissement de la pause méridienne pour les blocs
    if (currentConstraints.respecterPauseMidiBlocs !== false) {
      fallbackRecommendations.push({
        id: 'rec_pause_midi',
        category: 'PAUSE_MIDI',
        title: "Autoriser les blocs traversant la pause méridienne (créneau C4 + C5)",
        reasoning:
          "Permet de positionner des blocs de 2h à cheval entre la fin de matinée et le début d'après-midi lorsque la journée est saturée.",
        impactHours: 2,
        patch: {
          respecterPauseMidiBlocs: false,
        },
      });
    }

    return res.json({
      summary: executionError
        ? `Note : Le moteur ${providerConfig?.name || providerId} a rencontré une indisponibilité (${executionError}). L'heuristique experte a généré immédiatement les recommandations optimales ci-dessous pour débloquer les ${missingTotal} heure(s) manquante(s).`
        : `Diagnostic algorithmique : ${missingTotal} heure(s) non affectée(s) pour ${unplacedUnits.length} unité(s). Des blocages surviennent sur les blocs et plafonds journaliers. Les assouplissements ci-dessous permettent au solveur d'atteindre 100 % d'insertion.`,
      predictedSuccessRate: 100,
      recommendations: fallbackRecommendations,
      engineMetadata: {
        providerId: providerId === 'heuristic' ? 'heuristic' : providerId,
        providerName: providerConfig?.name || 'Heuristique Experte',
        model: modelName,
        latencyMs: Date.now() - startTime,
        isFallback: providerId !== 'heuristic' && Boolean(executionError),
        fallbackReason: executionError || undefined,
      },
    });
  } catch (error: any) {
    console.error('Erreur critique dans /api/ai/recommend-relaxations:', error);
    return res.status(500).json({
      error: error?.message || 'Erreur interne lors de la génération des recommandations IA',
    });
  }
});

async function startServer() {
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static('dist'));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve('dist/index.html'));
    });
  } else {
    // Montage de Vite en mode middleware pour le dev
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`Serveur prêt sur http://0.0.0.0:${port}`);
  });
}

startServer();
