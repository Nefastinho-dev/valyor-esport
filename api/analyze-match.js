import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Méthode non autorisée' });
    }

    try {
        const { image_url, player_id, opponent_id } = req.body;

        if (!image_url || !player_id || !opponent_id) {
            return res.status(400).json({ error: 'Paramètres manquants' });
        }

        const imageResponse = await fetch(image_url);
        if (!imageResponse.ok) throw new Error("Impossible de récupérer l'image.");
        const imageBuffer = await imageResponse.arrayBuffer();
        const base64Image = Buffer.from(imageBuffer).toString('base64');

        // LA CORRECTION EST ICI : on utilise gemini-3.6-flash comme demandé par l'API
        const geminiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${process.env.GEMINI_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{
                    parts: [
                        { text: "Analyse cette capture d'écran de score. Détermine si le joueur principal a gagné ou perdu, et renvoie uniquement un format JSON strict sans markdown, sous la forme exacte: {\"winner\": \"player\"} ou {\"winner\": \"opponent\"}" },
                        { 
                            inline_data: { 
                                mime_type: "image/jpeg", 
                                data: base64Image 
                            } 
                        }
                    ]
                }]
            })
        });

        const geminiData = await geminiResponse.json();
        if (!geminiResponse.ok) {
            throw new Error(geminiData.error?.message || "Erreur Gemini");
        }

        const candidateText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
        const cleanJsonText = candidateText.replace(/```json/g, '').replace(/```/g, '').trim();
        const analysisResult = JSON.parse(cleanJsonText);

        const supabase = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY
        );

        const winnerId = analysisResult.winner === 'opponent' ? opponent_id : player_id;

        const { data: profile } = await supabase.from('profiles').select('points_rl').eq('id', winnerId).single();
        const newPoints = (profile?.points_rl || 0) + 50;

        await supabase.from('profiles').update({ points_rl: newPoints }).eq('id', winnerId);

        return res.status(200).json({ success: true, winner: winnerId });
    } catch (error) {
        console.error("Erreur analyze-match:", error);
        return res.status(500).json({ error: error.message });
    }
}
