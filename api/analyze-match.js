// api/analyze-match.js
import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Méthode non autorisée' });
    }

    try {
        const { image_url, player_id, opponent_id } = req.body;

        if (!image_url || !player_id || !opponent_id) {
            return res.status(400).json({ error: 'Paramètres manquants (image_url, player_id ou opponent_id)' });
        }

        // 1. Télécharger l'image depuis l'URL publique Supabase pour l'envoyer à Gemini
        const imageResponse = await fetch(image_url);
        if (!imageResponse.ok) throw new Error("Impossible de récupérer l'image stockée.");
        const imageBuffer = await imageResponse.arrayBuffer();
        const base64Image = Buffer.from(imageBuffer).toString('base64');

        // 2. Appel à l'API Gemini pour analyser l'image du match
        const geminiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{
                    parts: [
                        { text: "Analyse cette capture d'écran de score de Rocket League. Détermine si le joueur principal a gagné ou perdu, et renvoie uniquement un format JSON valide strict sans markdown (pas de 
http://googleusercontent.com/immersive_entry_chip/0

---

### 3. Dernières étapes
1. Enregistre ton `package.json` et ton `api/analyze-match.js`.
2. Pousse tout sur ton dépôt GitHub (`git add .`, `git commit -m "Fix dependencies and image processing"`, `git push`).
3. Vérifie sur ton dashboard Vercel que ton projet s'est bien redéployé sans erreur.
