import { createClient } from '@supabase/supabase-js';

// --- DICTIONNAIRES DES BARÈMES ---
const winPointsMatrix = {
    'Bronze': 9, 'Argent': 11, 'Or': 20, 'Platine': 27,
    'Diamant': 34, 'Champion': 47, 'GC': 73, 'SSL': 93
};

const losePointsMatrix = {
    'Bronze': { 'Bronze': 35, 'Argent': 60, 'Or': 110, 'Platine': 170, 'Diamant': 250, 'Champion': 360, 'GC': 550, 'SSL': 800 },
    'Argent': { 'Bronze': 25, 'Argent': 45, 'Or': 90, 'Platine': 140, 'Diamant': 210, 'Champion': 310, 'GC': 480, 'SSL': 700 },
    'Or': { 'Bronze': 18, 'Argent': 32, 'Or': 70, 'Platine': 115, 'Diamant': 180, 'Champion': 270, 'GC': 420, 'SSL': 620 },
    'Platine': { 'Bronze': 12, 'Argent': 22, 'Or': 50, 'Platine': 95, 'Diamant': 150, 'Champion': 230, 'GC': 360, 'SSL': 540 },
    'Diamant': { 'Bronze': 10, 'Argent': 16, 'Or': 35, 'Platine': 70, 'Diamant': 125, 'Champion': 195, 'GC': 310, 'SSL': 460 },
    'Champion': { 'Bronze': 10, 'Argent': 12, 'Or': 25, 'Platine': 50, 'Diamant': 95, 'Champion': 160, 'GC': 260, 'SSL': 390 },
    'GC': { 'Bronze': 10, 'Argent': 12, 'Or': 18, 'Platine': 35, 'Diamant': 65, 'Champion': 120, 'GC': 200, 'SSL': 320 },
    'SSL': { 'Bronze': 10, 'Argent': 12, 'Or': 18, 'Platine': 28, 'Diamant': 45, 'Champion': 85, 'GC': 150, 'SSL': 350 }
};

function getNormalizedRank(rankStr) {
    if (!rankStr) return 'Bronze';
    const r = rankStr.trim().toLowerCase();
    if (r.includes('bronze')) return 'Bronze';
    if (r.includes('argent')) return 'Argent';
    if (r.includes('or')) return 'Or';
    if (r.includes('platine')) return 'Platine';
    if (r.includes('diamant')) return 'Diamant';
    if (r.includes('champion')) return 'Champion';
    if (r.includes('gc')) return 'GC';
    if (r.includes('ssl')) return 'SSL';
    return 'Bronze';
}

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

        const promptText = `Tu es un arbitre de jeu vidéo strict.
Analyse cette image :
1. Est-ce qu'il s'agit bien d'une capture d'écran de tableau de score / fin de match de jeu vidéo ? Si NON, renvoie exactement: {"valid": false}
2. Si OUI, détermine le gagnant du match :
   - Si le joueur principal (celui qui a pris la capture ou qui est indiqué gagnant/victoire) a gagné, renvoie: {"valid": true, "winner": "player"}
   - Si l'adversaire a gagné (ou si l'écran indique Défaite), renvoie: {"valid": true, "winner": "opponent"}
Renvoie EXCLUSIVEMENT un objet JSON strict sans aucun formatage Markdown.`;

        const geminiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${process.env.GEMINI_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{
                    parts: [
                        { text: promptText },
                        { inline_data: { mime_type: "image/jpeg", data: base64Image } }
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
        
        let analysisResult;
        try {
            analysisResult = JSON.parse(cleanJsonText);
        } catch (e) {
            return res.status(400).json({ error: "Impossible d'analyser le contenu de l'image." });
        }

        // Vérification 1 : L'image est-elle valide ?
        if (!analysisResult.valid) {
            return res.status(400).json({ error: "L'image fournie n'est pas une capture d'écran de score valide." });
        }

        // Vérification 2 : Le résultat est-il clair ?
        if (analysisResult.winner !== 'player' && analysisResult.winner !== 'opponent') {
            return res.status(400).json({ error: "Impossible de déterminer le gagnant sur cette capture d'écran." });
        }

        const supabase = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY
        );

        const winnerId = analysisResult.winner === 'opponent' ? opponent_id : player_id;
        const loserId = analysisResult.winner === 'opponent' ? player_id : opponent_id;

        const { data: winnerProfile } = await supabase.from('profiles').select('points_rl, rank_rl').eq('id', winnerId).single();
        const { data: loserProfile } = await supabase.from('profiles').select('points_rl, rank_rl').eq('id', loserId).single();

        const winnerRank = getNormalizedRank(winnerProfile?.rank_rl);
        const loserRank = getNormalizedRank(loserProfile?.rank_rl);

        const pointsWon = winPointsMatrix[loserRank] || 9;
        const pointsLost = losePointsMatrix[winnerRank]?.[loserRank] || 10;

        const newWinnerPoints = (winnerProfile?.points_rl || 0) + pointsWon;
        const newLoserPoints = Math.max((loserProfile?.points_rl || 0) - pointsLost, 0);

        await supabase.from('profiles').update({ points_rl: newWinnerPoints }).eq('id', winnerId);
        await supabase.from('profiles').update({ points_rl: newLoserPoints }).eq('id', loserId);

        return res.status(200).json({ 
            success: true, 
            winner: winnerId, 
            loser: loserId,
            points_won: pointsWon,
            points_lost: pointsLost,
            message: `Match analysé. Le gagnant a reçu +${pointsWon} pts, le perdant a perdu -${pointsLost} pts.`
        });
    } catch (error) {
        console.error("Erreur analyze-match:", error);
        return res.status(500).json({ error: error.message });
    }
}
 
