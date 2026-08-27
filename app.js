// Remplace par tes clés trouvées dans Supabase (Settings > API)
const SUPABASE_URL = "dgtkbwdgpudmzwukbyuu";
const SUPABASE_ANON_KEY = "https://dgtkbwdgpudmzwukbyuu.supabase.co/rest/v1/";

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// 1. GESTION DE L'INSCRIPTION
document.getElementById('signup-form').addEventListener('submit', async (e) => {
    e.preventDefault();

    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const username = document.getElementById('username').value;
    const phone = document.getElementById('phone').value;
    const trackerUsername = document.getElementById('tracker-username').value;
    const trackerLink = document.getElementById('tracker-link').value;

    const selectedGames = Array.from(document.querySelectorAll('input[name="games"]:checked'))
        .map(cb => cb.value);

    const { data, error } = await supabase.auth.signUp({
        email: email,
        password: password,
        options: {
            data: {
                username: username,
                phone_number: phone,
                tracker_username: trackerUsername,
                tracker_link: trackerLink,
                games: selectedGames
            }
        }
    });

    if (error) {
        alert("Erreur lors de l'inscription : " + error.message);
    } else {
        alert("Compte créé avec succès !");
    }
});

// 2. FONCTION D'ARBITRAGE ET ENVOI DE LA PREUVE (Le script précédent placé ici)
async function submitMatchProof(matchId, file, playerAName, playerBName, game, stakePoints) {
    const statusDiv = document.getElementById('status-message');
    statusDiv.textContent = "Analyse de l'image par l'IA en cours...";

    try {
        // A. Upload de la capture
        const fileName = `${matchId}/${Date.now()}_${file.name}`;
        const { error: uploadError } = await supabase.storage
            .from('match-proofs')
            .upload(fileName, file);

        if (uploadError) throw uploadError;

        // B. URL publique
        const { data: { publicUrl } } = supabase.storage
            .from('match-proofs')
            .getPublicUrl(fileName);

        // C. Notification dans le chat
        const user = (await supabase.auth.getUser()).data.user;
        await supabase.from('chat_messages').insert({
            match_id: matchId,
            sender_id: user.id,
            message: "Capture envoyée pour arbitrage.",
            image_url: publicUrl
        });

        // D. Appel de l'Edge Function Gemini
        const { data: aiResult, error: functionError } = await supabase.functions.invoke('analyze-match', {
            body: {
                match_id: matchId,
                image_url: publicUrl,
                player_a_name: playerAName,
                player_b_name: playerBName,
                game: game,
                stake_points: stakePoints
            }
        });

        if (functionError) throw functionError;

        statusDiv.textContent = `Match validé ! Gagnant : ${aiResult.result.winner_username}`;
        return aiResult;

    } catch (err) {
        statusDiv.textContent = "Erreur lors de l'analyse : " + err.message;
    }
}

// 3. DECLENCHEMENT AU CLIC
document.getElementById('proof-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fileInput = document.getElementById('proof-file');
    const file = fileInput.files[0];

    if (!file) return;

    // Exemple avec des données de match fictives (à remplacer par le match en cours)
    const matchId = "ID_DU_MATCH_EN_COURS";
    const playerA = "Néfastinho.";
    const playerB = "Adversaire123";
    const game = "Rocket League";
    const stakePoints = 15;

    await submitMatchProof(matchId, file, playerA, playerB, game, stakePoints);
});