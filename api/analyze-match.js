
import React, { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

// Initialisation du client Supabase
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'TA_SUPABASE_URL',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'TA_SUPABASE_ANON_KEY'
);

export default function MatchSubmitForm() {
  const [selectedGame, setSelectedGame] = useState('Rocket League');
  const [opponents, setOpponents] = useState([]);
  const [selectedOpponent, setSelectedOpponent] = useState('');
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState(null);

  // Charger la liste des joueurs (adversaires potentiels)
  useEffect(() => {
    async function fetchPlayers() {
      const { data: { user } } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from('profiles')
        .select('id, username')
        .neq('id', user?.id || '');

      if (!error && data) {
        setOpponents(data);
      }
    }
    fetchPlayers();
  }, []);

  // Fonction principale d'envoi et d'analyse
  const handleAnalyzeMatch = async (e) => {
    e.preventDefault();

    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      setStatusMessage({ type: 'error', text: 'Vous devez être connecté.' });
      return;
    }
    if (!selectedOpponent) {
      setStatusMessage({ type: 'error', text: 'Veuillez sélectionner un adversaire.' });
      return;
    }
    if (!file) {
      setStatusMessage({ type: 'error', text: "Veuillez choisir une capture d'écran." });
      return;
    }

    setLoading(true);
    setStatusMessage({ type: 'info', text: "⏳ Analyse de l'image par l'IA en cours..." });

    try {
      // 1. Upload de la preuve sur Supabase Storage
      const fileName = `${Date.now()}_${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from('match-proofs')
        .upload(fileName, file);

      if (uploadError) throw new Error("Erreur lors de l'envoi du fichier.");

      // 2. Récupération de l'URL publique de l'image
      const { data: publicUrlData } = supabase.storage
        .from('match-proofs')
        .getPublicUrl(fileName);

      const imageUrl = publicUrlData.publicUrl;

      // 3. Appel de l'API Serverless Gemini (/api/analyze-match)
      const response = await fetch('/api/analyze-match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image_url: imageUrl,
          player_id: user.id,
          opponent_id: selectedOpponent
        })
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "L'analyse a échoué.");
      }

      // 4. Succès : mise à jour du statut avec le message de l'API
      setStatusMessage({
        type: 'success',
        text: `✅ ${result.message}`
      });
      setFile(null);

    } catch (err) {
      console.error(err);
      setStatusMessage({
        type: 'error',
        text: `❌ ${err.message}`
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: '400px', margin: '0 auto', color: '#fff' }}>
      <form onSubmit={handleAnalyzeMatch}>
        {/* Jeu concerné */}
        <div style={{ marginBottom: '15px' }}>
          <label style={{ display: 'block', marginBottom: '5px', color: '#c084fc' }}>Jeu concerné :</label>
          <select 
            value={selectedGame} 
            onChange={(e) => setSelectedGame(e.target.value)}
            style={{ width: '100%', padding: '10px', borderRadius: '8px', background: '#0f172a', color: '#fff', border: '1px solid #334155' }}
          >
            <option value="Rocket League">Rocket League</option>
            <option value="Brawl Stars">Brawl Stars</option>
            <option value="Fortnite">Fortnite</option>
          </select>
        </div>

        {/* Adversaire affronté */}
        <div style={{ marginBottom: '15px' }}>
          <label style={{ display: 'block', marginBottom: '5px', color: '#c084fc' }}>Adversaire affronté :</label>
          <select 
            value={selectedOpponent} 
            onChange={(e) => setSelectedOpponent(e.target.value)}
            style={{ width: '100%', padding: '10px', borderRadius: '8px', background: '#0f172a', color: '#fff', border: '1px solid #334155' }}
          >
            <option value="">-- Sélectionnez un joueur --</option>
            {opponents.map((op) => (
              <option key={op.id} value={op.id}>{op.username}</option>
            ))}
          </select>
        </div>

        {/* Capture d'écran */}
        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', marginBottom: '5px', color: '#c084fc' }}>Capture d'écran du score final :</label>
          <input 
            type="file" 
            accept="image/*"
            onChange={(e) => setFile(e.target.files[0])}
            style={{ width: '100%', padding: '10px', background: '#0f172a', borderRadius: '8px', border: '1px solid #334155' }}
          />
        </div>

        {/* Bouton de soumission */}
        <button 
          type="submit" 
          disabled={loading}
          style={{ 
            width: '100%', 
            padding: '12px', 
            borderRadius: '8px', 
            border: 'none', 
            background: 'linear-gradient(90deg, #3b82f6, #a855f7)', 
            color: '#fff', 
            fontWeight: 'bold', 
            cursor: loading ? 'not-allowed' : 'pointer' 
          }}
        >
          {loading ? 'Analyse en cours...' : 'Envoyer et analyser le match'}
        </button>
      </form>

      {/* Zone d'affichage du résultat de l'API */}
      {statusMessage && (
        <div style={{ 
          marginTop: '15px', 
          padding: '10px', 
          borderRadius: '6px',
          color: statusMessage.type === 'success' ? '#4ade80' : statusMessage.type === 'error' ? '#f87171' : '#93c5fd',
          textAlign: 'center'
        }}>
          {statusMessage.text}
        </div>
      )}
    </div>
  );
}
