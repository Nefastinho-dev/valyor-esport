const SUPABASE_URL = "https://dgtkbwdgpudmzwukbyuu.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_be7xfwYmWcJKhk03KQ58oQ_Q8XxqAZZ";

let clientSupabase = null;
let playersData = []; 

const scrimRanksMap = {
    "Rocket League": ["Non classé", "gold", "Plat", "Diams", "Champ", "Gc", "Ssl"],
    "Brawl Stars": ["Non classé", "mythic", "Légendaire", "Star", "Pro"],
    "Fortnite": ["Non classé", "élite", "Champion", "Unreal"]
};

const rankWeightsRl = { "Non joué": 0, "gold": 1, "Plat": 2, "Diams": 3, "Champ": 4, "Gc": 5, "Ssl": 6 };
const rankWeightsBs = { "Non joué": 0, "mythic": 1, "Légendaire": 2, "Star": 3, "Pro": 4 };
const rankWeightsFn = { "Non joué": 0, "élite": 1, "Champion": 2, "Unreal": 3 };

window.addEventListener('DOMContentLoaded', async () => {
    if (typeof supabase !== 'undefined') {
        clientSupabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    }

    // Gestion de la session utilisateur
    if (clientSupabase) {
        const { data: { session } } = await clientSupabase.auth.getSession();
        if (session) {
            await checkUserAdminStatus(session.user);
            updateNavForLoggedInUser();
        } else {
            updateNavForLoggedOutUser();
        }
    }

    // Initialisation des formulaires et fonctionnalités selon la page courante
    initScrimForms();
    initAuthForms();
    initMatchsPage();
    initLeaderboardPage();
    initAdminPage();

    // Bouton de déconnexion
    const btnLogout = document.getElementById('btn-logout');
    if (btnLogout) {
        btnLogout.addEventListener('click', async (e) => {
            e.preventDefault();
            if (clientSupabase) {
                await clientSupabase.auth.signOut();
                alert("Vous êtes déconnecté.");
                window.location.href = "connexion.html";
            }
        });
    }
});

async function checkUserAdminStatus(user) {
    const adminEmails = ["kstorpaslefaut@gmail.com"];
    const isAdmin = adminEmails.includes(user.email) || user.user_metadata?.is_admin === true;
    
    const adminBtn = document.getElementById('btn-admin');
    if (adminBtn) {
        adminBtn.style.display = isAdmin ? 'inline-block' : 'none';
    }
}

function updateNavForLoggedInUser() {
    const connBtn = document.getElementById('btn-connexion');
    const inscBtn = document.getElementById('btn-inscription');
    const matchsBtn = document.getElementById('btn-matchs-historique');
    const classBtn = document.getElementById('btn-classement');
    const credBtn = document.getElementById('btn-credits');
    const logoutBtn = document.getElementById('btn-logout');

    if (connBtn) connBtn.style.display = 'none';
    if (inscBtn) inscBtn.style.display = 'none';

    if (matchsBtn) matchsBtn.style.display = 'inline-block';
    if (classBtn) classBtn.style.display = 'inline-block';
    if (credBtn) credBtn.style.display = 'inline-block';
    if (logoutBtn) logoutBtn.style.display = 'inline-block';
}

function updateNavForLoggedOutUser() {
    const connBtn = document.getElementById('btn-connexion');
    const inscBtn = document.getElementById('btn-inscription');
    const matchsBtn = document.getElementById('btn-matchs-historique');
    const classBtn = document.getElementById('btn-classement');
    const adminBtn = document.getElementById('btn-admin');
    const credBtn = document.getElementById('btn-credits');
    const logoutBtn = document.getElementById('btn-logout');

    if (connBtn) connBtn.style.display = 'inline-block';
    if (inscBtn) inscBtn.style.display = 'inline-block';

    if (matchsBtn) matchsBtn.style.display = 'none';
    if (classBtn) classBtn.style.display = 'none';
    if (adminBtn) adminBtn.style.display = 'none';
    if (credBtn) credBtn.style.display = 'none';
    if (logoutBtn) logoutBtn.style.display = 'none';
}

/* --- Formulaire de Scrim --- */
function initScrimForms() {
    const scrimGameSelect = document.getElementById('scrim-game-select');
    const scrimRankMinSelect = document.getElementById('scrim-rank-min');
    const scrimRankMaxSelect = document.getElementById('scrim-rank-max');
    
    function updateScrimRanks() {
        if (!scrimGameSelect || !scrimRankMinSelect || !scrimRankMaxSelect) return;
        const game = scrimGameSelect.value;
        const ranks = scrimRanksMap[game] || [];
        scrimRankMinSelect.innerHTML = '';
        scrimRankMaxSelect.innerHTML = '';
        ranks.forEach(r => {
            scrimRankMinSelect.innerHTML += `<option value="${r}">${r}</option>`;
            scrimRankMaxSelect.innerHTML += `<option value="${r}">${r}</option>`;
        });
    }

    if (scrimGameSelect) {
        scrimGameSelect.addEventListener('change', updateScrimRanks);
        updateScrimRanks();
    }

    const scrimForm = document.getElementById('scrim-request-form');
    if (scrimForm) {
        scrimForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const statusDiv = document.getElementById('scrim-req-status');
            if (!clientSupabase) return;

            const { data: { user } } = await clientSupabase.auth.getUser();
            if (!user) {
                statusDiv.innerText = "❌ Vous devez être connecté et enregistré pour demander un Scrim.";
                return;
            }

            statusDiv.innerText = "Envoi de la demande et du logo en cours...";

            const scrimGame = document.getElementById('scrim-game-select').value;
            const scrimRankMin = document.getElementById('scrim-rank-min').value;
            const scrimRankMax = document.getElementById('scrim-rank-max').value;
            const scrimDate = document.getElementById('scrim-datetime').value;
            const format = document.getElementById('scrim-format').value;
            const boFormat = document.getElementById('scrim-bo').value;
            const teamName = document.getElementById('scrim-team-name').value;
            const logoFileInput = document.getElementById('scrim-team-logo');
            const logoFile = logoFileInput ? logoFileInput.files[0] : null;

            let logoUrl = null;
            try {
                if (logoFile) {
                    const ext = logoFile.name.split('.').pop() || 'png';
                    const cleanName = logoFile.name.replace(/[^a-zA-Z0-9]/g, "_");
                    const logoPath = `logo_${Date.now()}_${cleanName}.${ext}`;

                    const { error: uploadError } = await clientSupabase.storage
                        .from('scrim-team-logos')
                        .upload(logoPath, logoFile, { upsert: true });

                    if (uploadError) {
                        throw new Error("Erreur d'upload du logo : " + uploadError.message);
                    }

                    const { data: publicUrlData } = clientSupabase.storage
                        .from('scrim-team-logos')
                        .getPublicUrl(logoPath);
                    
                    logoUrl = publicUrlData ? publicUrlData.publicUrl : null;
                }

                const rankRangeStr = `${scrimRankMin} à ${scrimRankMax}`;
                const formattedDate = scrimDate ? new Date(scrimDate).toISOString() : new Date().toISOString();

                const { error } = await clientSupabase.from('scrim_requests').insert([{
                    user_id: user.id,
                    user_email: user.email,
                    game: scrimGame,
                    rank_range: rankRangeStr,
                    scrim_date: formattedDate,
                    format: format,
                    bo_format: boFormat,
                    team_name: teamName,
                    team_logo_url: logoUrl,
                    status: 'en_attente',
                    chat_messages: []
                }]);

                if (error) {
                    statusDiv.innerText = "❌ Erreur lors de l'envoi de la demande : " + error.message;
                } else {
                    statusDiv.innerText = "✅ Demande de scrim envoyée avec succès aux administrateurs !";
                    scrimForm.reset();
                }
            } catch (err) {
                statusDiv.innerText = "❌ Erreur : " + err.message;
            }
        });
    }
}

/* --- Inscription & Connexion --- */
function initAuthForms() {
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const statusDiv = document.getElementById('login-status');
            const email = document.getElementById('login-email').value;
            const password = document.getElementById('login-password').value;

            statusDiv.innerText = "Connexion en cours...";

            const { data, error } = await clientSupabase.auth.signInWithPassword({ email, password });

            if (error) {
                statusDiv.innerText = "❌ Erreur : " + error.message;
            } else {
                statusDiv.innerText = "✅ Connexion réussie ! Redirection...";
                setTimeout(() => {
                    window.location.href = "index.html";
                }, 600);
            }
        });
    }

    const signupForm = document.getElementById('signup-form');
    if (signupForm) {
        signupForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const statusDiv = document.getElementById('auth-status');
            if (!clientSupabase) return;

            statusDiv.innerText = "Enregistrement en cours...";
            
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;
            const username = document.getElementById('username').value;
            const contactType = document.getElementById('contact-type').value;
            const contactValue = document.getElementById('contact-value').value;
            const role = document.getElementById('user-role').value;
            const youtubeLink = document.getElementById('youtube-link').value;
            const rankRl = document.getElementById('rank-rl').value;
            const rankBs = document.getElementById('rank-bs').value;
            const rankFn = document.getElementById('rank-fn').value;

            const rankPoints = {
                "Non joué": 0, "gold": 150, "Plat": 230, "Diams": 325,
                "Champ": 500, "Gc": 850, "Ssl": 1100
            };

            const startingPoints = rankPoints[rankRl] || 0;

            const { data, error } = await clientSupabase.auth.signUp({
                email, 
                password, 
                options: { 
                    data: { 
                        username: username, 
                        contact_type: contactType,
                        contact_value: contactValue,
                        role: role,
                        youtube_link: youtubeLink,
                        rank_rl: rankRl,
                        rank_bs: rankBs,
                        rank_fn: rankFn,
                        points_rl: startingPoints,
                        show_in_leaderboard: true
                    } 
                }
            });

            if (error) {
                statusDiv.innerText = "❌ Erreur : " + error.message;
                return;
            }

            statusDiv.innerText = `✅ Compte créé ! Bonus de bienvenue : ${startingPoints} pts. Vous pouvez vous connecter.`;
            signupForm.reset();
        });
    }
}

/* --- Page Matchs & Historique --- */
function initMatchsPage() {
    const subtabSoumettre = document.getElementById('subtab-soumettre');
    const subtabHistorique = document.getElementById('subtab-historique');

    if (subtabSoumettre && subtabHistorique) {
        subtabSoumettre.addEventListener('click', () => {
            subtabSoumettre.classList.add('active');
            subtabHistorique.classList.remove('active');
            document.getElementById('subcontent-soumettre').style.display = 'block';
            document.getElementById('subcontent-historique').style.display = 'none';
        });

        subtabHistorique.addEventListener('click', () => {
            subtabHistorique.classList.add('active');
            subtabSoumettre.classList.remove('active');
            document.getElementById('subcontent-historique').style.display = 'block';
            document.getElementById('subcontent-soumettre').style.display = 'none';
            loadHistory();
        });

        loadOpponents();
        loadHistory();
    }

    const matchForm = document.getElementById('match-form');
    if (matchForm) {
        matchForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const statusDiv = document.getElementById('match-status');
            const game = document.getElementById('match-game').value; 
            const selectOpponent = document.getElementById('match-opponent');
            const opponentId = selectOpponent.value;
            const selectedOption = selectOpponent.options[selectOpponent.selectedIndex];
            const opponentName = selectedOption ? (selectedOption.getAttribute('data-username') || selectedOption.text) : "Adversaire";

            const fileInput = document.getElementById('match-file');
            const file = fileInput.files[0];

            if (!opponentId) { alert("Veuillez sélectionner un adversaire."); return; }
            statusDiv.innerText = "Envoi de la preuve...";

            try {
                const sanitizedFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
                const filePath = `${Date.now()}_${sanitizedFileName}`;

                const { error: uploadError } = await clientSupabase.storage.from('match-proofs').upload(filePath, file);
                if (uploadError) throw uploadError;

                await clientSupabase.from('matches').insert([{
                    game: game,
                    players_summary: `Match vs ${opponentName}`,
                    status: 'En attente',
                    created_at: new Date().toISOString()
                }]);

                statusDiv.innerText = "✅ Match soumis avec succès ! En attente de validation.";
                matchForm.reset();
                loadHistory();
            } catch (err) {
                statusDiv.innerText = "❌ Erreur : " + err.message;
            }
        });
    }
}

async function loadOpponents() {
    const select = document.getElementById('match-opponent');
    if (!select || !clientSupabase) return;
    const { data: players } = await clientSupabase.from('profiles').select('id, username');
    if (players) {
        select.innerHTML = '<option value="">-- Sélectionnez un joueur --</option>';
        players.forEach(p => { 
            select.innerHTML += `<option value="${p.id}" data-username="${p.username}">${p.username}</option>`; 
        });
    }
}

async function loadHistory() {
    const tbody = document.getElementById('history-body');
    if (!tbody || !clientSupabase) return;
    const { data: matches, error } = await clientSupabase.from('matches').select('*').order('created_at', { ascending: false });

    if (error || !matches || matches.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Aucun historique enregistré.</td></tr>';
        return;
    }

    tbody.innerHTML = '';
    matches.forEach(m => {
        const date = m.created_at ? new Date(m.created_at).toLocaleString('fr-FR') : 'Date non spécifiée';
        tbody.innerHTML += `
            <tr>
                <td>${date}</td>
                <td>${m.game || 'Scrim'}</td>
                <td>${m.players_summary || 'Match'}</td>
                <td><span style="color:${m.status === 'Validé' ? '#4ade80' : (m.status === 'À venir' ? '#60a5fa' : '#f87171')}">${m.status || 'En attente'}</span></td>
                <td><button type="button" class="delete-btn" onclick="deleteMatchFromHistory('${m.id}')">Supprimer</button></td>
            </tr>
        `;
    });
}

window.deleteMatchFromHistory = async function(matchId) {
    if (!confirm("Voulez-vous vraiment supprimer ce match/scrim de l'historique ?")) return;
    const { error } = await clientSupabase.from('matches').delete().eq('id', matchId);
    if (error) {
        alert("❌ Erreur lors de la suppression : " + error.message);
    } else {
        alert("✅ Élément supprimé avec succès !");
        loadHistory();
    }
};

/* --- Classement --- */
function initLeaderboardPage() {
    const filter = document.getElementById('leaderboard-filter');
    if (filter) {
        filter.addEventListener('change', loadLeaderboard);
        loadLeaderboard();
    }
}

async function loadLeaderboard() {
    const tbody = document.getElementById('leaderboard-body');
    if (!tbody || !clientSupabase) return;
    const filter = document.getElementById('leaderboard-filter') ? document.getElementById('leaderboard-filter').value : 'points_rl';
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">Chargement...</td></tr>';

    const { data: players, error } = await clientSupabase
        .from('profiles')
        .select('*')
        .neq('show_in_leaderboard', false);

    if (error || !players || players.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">Aucun joueur trouvé.</td></tr>';
        return;
    }

    players.sort((a, b) => {
        if (filter === 'points_rl') {
            return (b.points_rl || 0) - (a.points_rl || 0);
        } else if (filter === 'rank_rl') {
            return (rankWeightsRl[b.rank_rl] || 0) - (rankWeightsRl[a.rank_rl] || 0);
        } else if (filter === 'rank_bs') {
            return (rankWeightsBs[b.rank_bs] || 0) - (rankWeightsBs[a.rank_bs] || 0);
        } else if (filter === 'rank_fn') {
            return (rankWeightsFn[b.rank_fn] || 0) - (rankWeightsFn[a.rank_fn] || 0);
        }
        return 0;
    });

    tbody.innerHTML = '';
    players.forEach((p, index) => {
        let rankBadge = index === 0 ? '🥇' : (index === 1 ? '🥈' : (index === 2 ? '🥉' : `#${index + 1}`));
        tbody.innerHTML += `
            <tr>
                <td><strong>${rankBadge}</strong></td>
                <td>${p.username || 'Anonyme'}</td>
                <td><span style="color: #c084fc; font-weight: 600;">${p.role || 'Joueur'}</span></td>
                <td><strong>${p.points_rl ?? 0} pts</strong></td>
                <td>${p.rank_bs || 'Non joué'}</td>
                <td>${p.rank_fn || 'Non joué'}</td>
            </tr>
        `;
    });
}

/* --- Panel Admin --- */
function initAdminPage() {
    const subtabAdminPoints = document.getElementById('subtab-admin-points');
    const subtabAdminProfiles = document.getElementById('subtab-admin-profiles');
    const subtabAdminScrims = document.getElementById('subtab-admin-scrims');
    const subtabAdminProofs = document.getElementById('subtab-admin-proofs');

    if (subtabAdminPoints && subtabAdminProfiles && subtabAdminScrims && subtabAdminProofs) {
        const subAdminTabs = [
            { btn: subtabAdminPoints, content: 'subcontent-admin-points', action: null },
            { btn: subtabAdminProfiles, content: 'subcontent-admin-profiles', action: null },
            { btn: subtabAdminScrims, content: 'subcontent-admin-scrims', action: loadAdminScrims },
            { btn: subtabAdminProofs, content: 'subcontent-admin-proofs', action: loadAdminProofs }
        ];

        subAdminTabs.forEach(t => {
            t.btn.addEventListener('click', () => {
                subAdminTabs.forEach(other => {
                    other.btn.classList.remove('active');
                    document.getElementById(other.content).style.display = 'none';
                });
                t.btn.classList.add('active');
                document.getElementById(t.content).style.display = 'block';
                if (t.action) t.action();
            });
        });

        loadAdminPanel();
    }

    const editPlayerSelect = document.getElementById('admin-edit-player');
    if (editPlayerSelect) {
        editPlayerSelect.addEventListener('change', (e) => {
            const selectedId = e.target.value;
            const player = playersData.find(p => p.id === selectedId);
            if (player) {
                document.getElementById('admin-edit-username').value = player.username || '';
                document.getElementById('admin-edit-contact-type').value = player.contact_type || 'Numéro de téléphone';
                document.getElementById('admin-edit-contact-value').value = player.contact_value || '';
                document.getElementById('admin-edit-role').value = player.role || 'Joueur';
                document.getElementById('admin-edit-rank-rl').value = player.rank_rl || 'Non joué';
                document.getElementById('admin-edit-rank-bs').value = player.rank_bs || 'Non joué';
                document.getElementById('admin-edit-rank-fn').value = player.rank_fn || 'Non joué';
                document.getElementById('admin-edit-show-leaderboard').checked = player.show_in_leaderboard !== false;
            }
        });
    }

    const adminForm = document.getElementById('admin-form');
    if (adminForm) {
        adminForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const statusDiv = document.getElementById('admin-status');
            const playerId = document.getElementById('admin-player').value;
            const action = document.getElementById('admin-action').value;
            const amount = parseInt(document.getElementById('admin-points').value);

            if (!playerId || isNaN(amount)) return;
            statusDiv.innerText = "Mise à jour en cours...";

            const player = playersData.find(p => p.id === playerId);
            let currentPoints = player ? (player.points_rl || 0) : 0;
            let newPoints = action === 'add' ? currentPoints + amount : currentPoints - amount;
            if (newPoints < 0) newPoints = 0;

            const { error } = await clientSupabase.from('profiles').update({ points_rl: newPoints }).eq('id', playerId);

            if (error) {
                statusDiv.innerText = "❌ Erreur : " + error.message;
            } else {
                statusDiv.innerText = `✅ Succès ! Points mis à jour (${newPoints} pts).`;
                adminForm.reset();
                loadAdminPanel(); 
            }
        });
    }

    const adminProfileForm = document.getElementById('admin-profile-form');
    if (adminProfileForm) {
        adminProfileForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const statusDiv = document.getElementById('admin-profile-status');
            const playerId = document.getElementById('admin-edit-player').value;
            const newUsername = document.getElementById('admin-edit-username').value;
            const newContactType = document.getElementById('admin-edit-contact-type').value;
            const newContactValue = document.getElementById('admin-edit-contact-value').value;
            const newRole = document.getElementById('admin-edit-role').value;
            const newRankRl = document.getElementById('admin-edit-rank-rl').value;
            const newRankBs = document.getElementById('admin-edit-rank-bs').value;
            const newRankFn = document.getElementById('admin-edit-rank-fn').value;
            const showInLeaderboard = document.getElementById('admin-edit-show-leaderboard').checked;

            if (!playerId) return;
            statusDiv.innerText = "Mise à jour...";

            const { error } = await clientSupabase.from('profiles').update({ 
                username: newUsername,
                contact_type: newContactType,
                contact_value: newContactValue,
                role: newRole,
                rank_rl: newRankRl,
                rank_bs: newRankBs,
                rank_fn: newRankFn,
                show_in_leaderboard: showInLeaderboard
            }).eq('id', playerId);

            if (error) {
                statusDiv.innerText = "❌ Erreur : " + error.message;
            } else {
                statusDiv.innerText = "✅ Profil mis à jour avec succès !";
                loadAdminPanel();
            }
        });
    }
}

async function loadAdminPanel() {
    const selectPoints = document.getElementById('admin-player');
    const selectEdit = document.getElementById('admin-edit-player');
    if (!selectPoints || !selectEdit || !clientSupabase) return;
    
    selectPoints.innerHTML = '<option value="">-- Chargement... --</option>';
    selectEdit.innerHTML = '<option value="">-- Chargement... --</option>';
    
    const { data } = await clientSupabase.from('profiles').select('*').order('username');
    
    if (data) {
        playersData = data; 
        selectPoints.innerHTML = '<option value="">-- Sélectionnez un joueur --</option>';
        selectEdit.innerHTML = '<option value="">-- Sélectionnez un joueur --</option>';
        
        data.forEach(p => { 
            selectPoints.innerHTML += `<option value="${p.id}">${p.username} (Actuel: ${p.points_rl || 0} pts)</option>`;
            selectEdit.innerHTML += `<option value="${p.id}">${p.username}</option>`;
        });
    }
}

async function loadAdminScrims() {
    const container = document.getElementById('admin-scrims-list');
    const deleteSelect = document.getElementById('admin-delete-scrim-select');
    if (!container || !clientSupabase) return;

    const { data: scrims, error } = await clientSupabase
        .from('scrim_requests')
        .select('*')
        .order('scrim_date', { ascending: true });

    if (error || !scrims || scrims.length === 0) {
        container.innerHTML = '<p style="color: #9ca3af;">Aucune demande de scrim en attente.</p>';
        if (deleteSelect) deleteSelect.innerHTML = '<option value="">-- Aucun scrim disponible --</option>';
        return;
    }

    if (deleteSelect) {
        deleteSelect.innerHTML = '<option value="">-- Sélectionnez un scrim à supprimer --</option>';
        scrims.forEach(s => {
            const dateFormatted = new Date(s.scrim_date).toLocaleString('fr-FR');
            deleteSelect.innerHTML += `<option value="${s.id}">${s.team_name || 'Équipe'} | ${s.game || 'Scrim'} | Demandeur: ${s.user_email} (${dateFormatted})</option>`;
        });
    }

    container.innerHTML = '';
    scrims.forEach(s => {
        const dateFormatted = new Date(s.scrim_date).toLocaleString('fr-FR');
        let messagesHtml = '';
        const messages = s.chat_messages || [];
        messages.forEach(m => {
            messagesHtml += `<div style="margin-bottom: 5px;"><strong>${m.sender}:</strong> ${m.text}</div>`;
        });

        const logoHtml = s.team_logo_url 
            ? `<div style="margin-right: 12px;"><a href="${s.team_logo_url}" target="_blank"><img src="${s.team_logo_url}" alt="Logo" onerror="this.style.display='none'" style="width: 50px; height: 50px; object-fit: cover; border-radius: 6px; border: 1px solid rgba(124, 58, 237, 0.4);"></a></div>` 
            : '';

        container.innerHTML += `
            <div class="scrim-req-card" id="scrim-card-${s.id}">
                <div style="display: flex; align-items: center; margin-bottom: 10px;">
                    ${logoHtml}
                    <div>
                        <h4 style="margin: 0; color: #c084fc; font-size: 1.1rem;">Équipe : ${s.team_name || 'Non spécifié'}</h4>
                        <p style="margin: 2px 0 0 0; font-size: 0.85rem; color: #9ca3af;">Demandeur : ${s.user_email}</p>
                    </div>
                </div>
                <p><strong>Jeu :</strong> ${s.game || 'Non spécifié'} | <strong>Rangs :</strong> ${s.rank_range} | <strong>Format :</strong> ${s.format} (${s.bo_format})</p>
                <p><strong>Date prévue :</strong> ${dateFormatted}</p>
                <p><strong>Statut :</strong> <span style="color: #60a5fa;">${s.status}</span></p>
                
                <div id="chat-section-${s.id}" style="${s.status === 'negociation' ? 'display:block;' : 'display:none;'}">
                    <label style="font-size: 0.85rem;">Discussion / Négociation :</label>
                    <div class="chat-box" id="chat-box-${s.id}">${messagesHtml || '<em style="color:#777">Aucun message</em>'}</div>
                    <div style="display: flex; gap: 5px; margin-bottom: 10px;">
                        <input type="text" id="chat-input-${s.id}" placeholder="Écrire un message..." onkeypress="if(event.key === 'Enter') sendScrimMessage('${s.id}')">
                        <button type="button" class="nav-btn" onclick="sendScrimMessage('${s.id}')">Envoyer</button>
                    </div>
                </div>

                <div style="display: flex; gap: 10px; margin-top: 10px; flex-wrap: wrap;">
                    <button type="button" class="submit-btn" style="margin:0; background: linear-gradient(135deg, #22c55e, #15803d); flex:1;" onclick="updateScrimStatus('${s.id}', 'valide')">Valider</button>
                    <button type="button" class="submit-btn" style="margin:0; background: linear-gradient(135deg, #eab308, #ca8a04); flex:1;" onclick="toggleNegociation('${s.id}')">Négocier</button>
                    <button type="button" class="delete-btn" style="padding: 12px; flex:1;" onclick="updateScrimStatus('${s.id}', 'refuse')">Supprimer / Refuser</button>
                </div>
            </div>
        `;
    });
}

window.deleteSelectedScrim = async function() {
    const select = document.getElementById('admin-delete-scrim-select');
    const scrimId = select ? select.value : '';
    if (!scrimId) {
        alert("Veuillez sélectionner un scrim précis à supprimer dans le menu déroulant.");
        return;
    }
    if (!confirm("Voulez-vous vraiment supprimer ce scrim de la base de données ?")) return;

    const { error } = await clientSupabase.from('scrim_requests').delete().eq('id', scrimId);
    if (error) {
        alert("❌ Erreur lors de la suppression : " + error.message);
    } else {
        alert("✅ Le scrim a été supprimé avec succès !");
        loadAdminScrims();
    }
};

async function loadAdminProofs() {
    const container = document.getElementById('admin-proofs-list');
    if (!container || !clientSupabase) return;
    container.innerHTML = '<p style="color: #9ca3af;">Chargement des preuves...</p>';
    
    const { data: files, error } = await clientSupabase.storage
        .from('match-proofs')
        .list('', { limit: 50, sortBy: { column: 'created_at', order: 'desc' } });
    
    if (error || !files || files.length === 0) {
        container.innerHTML = '<p style="color: #9ca3af;">Aucune photo de preuve trouvée dans le bucket.</p>';
        return;
    }
    
    container.innerHTML = '';
    for (const file of files) {
        if (!file.id || file.name === 'matches' || !file.name.includes('.')) continue;
        
        const { data: { publicUrl } } = clientSupabase.storage.from('match-proofs').getPublicUrl(file.name);
        const createdAt = file.created_at ? new Date(file.created_at).toLocaleString('fr-FR') : 'Date récente';
        
        container.innerHTML += `
            <div style="background: rgba(20, 20, 35, 0.8); border: 1px solid rgba(124, 58, 237, 0.3); border-radius: 8px; padding: 10px; text-align: center;">
                <a href="${publicUrl}" target="_blank">
                    <img src="${publicUrl}" alt="${file.name}" onerror="this.style.display='none'" style="max-width: 100%; height: 140px; object-fit: cover; border-radius: 6px; margin-bottom: 8px; border: 1px solid rgba(255,255,255,0.1);">
                </a>
                <p style="font-size: 0.75rem; color: #d1d5db; margin: 4px 0; word-break: break-all;">${file.name}</p>
                <p style="font-size: 0.7rem; color: #9ca3af; margin: 0;">${createdAt}</p>
            </div>
        `;
    }

    if (container.innerHTML === '') {
        container.innerHTML = '<p style="color: #9ca3af;">Aucune photo de preuve trouvée.</p>';
    }
}

window.toggleNegociation = async function(id) {
    const chatSec = document.getElementById(`chat-section-${id}`);
    if (!chatSec) return;
    const isVisible = chatSec.style.display === 'block';
    chatSec.style.display = isVisible ? 'none' : 'block';
    
    if (!isVisible) {
        await clientSupabase.from('scrim_requests').update({ status: 'negociation' }).eq('id', id);
    }
};

window.sendScrimMessage = async function(id) {
    const input = document.getElementById(`chat-input-${id}`);
    const text = input ? input.value.trim() : '';
    if (!text) return;

    const { data: scrim } = await clientSupabase.from('scrim_requests').select('chat_messages').eq('id', id).single();
    const messages = scrim?.chat_messages || [];
    messages.push({ sender: 'Admin', text: text, time: new Date().toISOString() });

    await clientSupabase.from('scrim_requests').update({ chat_messages: messages }).eq('id', id);
    input.value = '';
    loadAdminScrims();
};

window.updateScrimStatus = async function(id, newStatus) {
    if (newStatus === 'refuse') {
        if (!confirm("Voulez-vous vraiment supprimer cette demande de scrim ?")) return;
        await clientSupabase.from('scrim_requests').delete().eq('id', id);
        alert("Demande supprimée.");
    } else if (newStatus === 'valide') {
        const { data: req } = await clientSupabase.from('scrim_requests').select('*').eq('id', id).single();
        if (req) {
            await clientSupabase.from('matches').insert([{
                game: `${req.game || 'Scrim'} (${req.format})`,
                players_summary: `Valyor vs ${req.team_name || req.user_email} (Rangs : ${req.rank_range})`,
                status: 'À venir',
                created_at: req.scrim_date ? new Date(req.scrim_date).toISOString() : new Date().toISOString()
            }]);
            await clientSupabase.from('scrim_requests').delete().eq('id', id);
            alert("✅ Scrim validé et déplacé vers l'historique !");
        }
    }
    loadAdminScrims();
};
