// api/analyze-match.js
import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Méthode non autorisée' });
    }

    try {
        const { image_url, player_id, opponent_id } = req.body;

        // 1. Appel à l'API Gemini pour analyser l'image du match
        const geminiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{
                    parts: [
                        { text: "Analyse cette capture d'écran de score de Rocket League. Détermine si le joueur a gagné ou perdu, et renvoie uniquement un format JSON simple comme ceci: {\"winner\": \"player\" ou \"opponent\"}" },
                        { inline_data: { mime_type: "image/jpeg", data: image_url } } // Ou passer l'URL selon le format géré par Gemini
                    ]
                }]
            })
        });

        // 2. Initialisation de Supabase avec la clé Service Role (pour avoir les droits d'écriture backend)
        const supabase = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY
        );

        // 3. Attribution des points au vainqueur dans la table 'profiles'
        // (Exemple simplifié : ajout de 50 points au gagnant)
        const winnerId = player_id; // À adapter selon le résultat renvoyé par Gemini

        const { data: profile } = await supabase.from('profiles').select('points_rl').eq('id', winnerId).single();
        const newPoints = (profile?.points_rl || 0) + 50;

        await supabase.from('profiles').update({ points_rl: newPoints }).eq('id', winnerId);

        return res.status(200).json({ success: true, winner: winnerId });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}
