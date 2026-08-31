import { createClient } from '@supabase/supabase-js';

// --- DICTIONNAIRES DES BARÈMES ---
// Points gagnés en fonction du rang de l'adversaire (le perdant)
const winPointsMatrix = {
    'Bronze': 9, 'Argent': 11, 'Or': 20, 'Platine': 27,
    'Diamant': 34, 'Champion': 47, 'GC': 73, 'SSL': 93
};

// Points perdus: losePointsMatrix[rang_du_gagnant][rang_du_perdant]
// Ex: Perdre sur Argent (gagnant) en étant Bronze (perdant) => losePointsMatrix['Argent']['Bronze']
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

// Fonction pour normaliser le texte du rang venant de Supabase
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
    return 'Bronze'; // Fallback par défaut si "Non joué"
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

        const geminiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{
                    parts: [
                        { text: "Analyse cette capture d'écran de score. Détermine si le joueur principal a gagné ou perdu, et renvoie uniquement un format JSON strict sans markdown, sous la forme exacte: {\"winner\": \"player\"} ou {\"winner\": \"opponent\"}" },
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
        const analysisResult = JSON.parse(cleanJsonText);

        const supabase = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY
        );

        // Identification du vainqueur et du perdant
        const winnerId = analysisResult.winner === 'opponent' ? opponent_id : player_id;
        const loserId = analysisResult.winner === 'opponent' ? player_id : opponent_id;

        // Récupération des profils (points actuels et rang)
        const { data: winnerProfile } = await supabase.from('profiles').select('points_rl, rank_rl').eq('id', winnerId).single();
        const { data: loserProfile } = await supabase.from('profiles').select('points_rl, rank_rl').eq('id', loserId).single();

        // Normalisation des rangs
        const winnerRank = getNormalizedRank(winnerProfile?.rank_rl);
        const loserRank = getNormalizedRank(loserProfile?.rank_rl);

        // --- CALCUL DES POINTS VIA LE BARÈME ---
        // Le gagnant reçoit des points basés sur le grade du perdant
        const pointsWon = winPointsMatrix[loserRank] || 9;
        
        // Le perdant perd des points basés sur son grade ET le grade de celui qui l'a battu
        const pointsLost = losePointsMatrix[winnerRank]?.[loserRank] || 10;

        // --- MISE À JOUR DANS SUPABASE ---
        const newWinnerPoints = (winnerProfile?.points_rl || 0) + pointsWon;
        const newLoserPoints = Math.max((loserProfile?.points_rl || 0) - pointsLost, 0); // On bloque le score minimum à 0

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
