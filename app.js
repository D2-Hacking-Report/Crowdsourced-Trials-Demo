const firebaseConfig = {
  apiKey: "AIzaSyAorpn0WBflUPKyx59iudTRDJ3tY2CYi9U",
  authDomain: "trials-cheaters-test.firebaseapp.com",
  projectId: "trials-cheaters-test",
  storageBucket: "trials-cheaters-test.firebasestorage.app",
  messagingSenderId: "532094831864",
  appId: "1:532094831864:web:ec2a5ecf36a1f9ab34bf0d",
  measurementId: "G-7H5XJZ7M9F"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

let currentPlayerId = null;

// --- Page-specific Logic ---

// Run initialization logic based on which page is currently loaded
window.onload = () => {
    if (document.getElementById('player-card')) {
        loadRandomPlayer();
        updateTopCheatersList();
    }
    if (document.getElementById('history-container')) {
        loadVoteHistory();
    }
};


// --- Feature 1 & Core Voting Logic ---

async function loadRandomPlayer() {
    const loadingDiv = document.getElementById('loading');
    const playerCardDiv = document.getElementById('player-card');

    loadingDiv.style.display = 'block';
    playerCardDiv.style.display = 'none';

    const votedOnPlayers = JSON.parse(localStorage.getItem('votedOnPlayers') || '{}');
    const votedOnIds = Object.keys(votedOnPlayers);

    try {
        const snapshot = await db.collection('players').where('isCleared', '==', false).get();
        
        let potentialPlayers = [];
        snapshot.forEach(doc => {
            if (!votedOnIds.includes(doc.id)) {
                potentialPlayers.push({ id: doc.id, ...doc.data() });
            }
        });

        if (potentialPlayers.length === 0) {
            loadingDiv.innerText = "No new players to review at this time. Check back later!";
            return;
        }

        const randomPlayer = potentialPlayers[Math.floor(Math.random() * potentialPlayers.length)];
        currentPlayerId = randomPlayer.id;

        const playerLink = document.getElementById('player-link-display');
        playerLink.href = `https://trials.report/report/${randomPlayer.membershipType}/${randomPlayer.membershipId}`;
        // CHANGE: Removed player name for generic text to prevent displaying bad data.
        playerLink.innerText = `View Player on Trials Report`;

        loadingDiv.style.display = 'none';
        document.getElementById('results').style.display = 'none';
        playerCardDiv.style.display = 'block';
        document.getElementById('vote-cheater').disabled = false;
        document.getElementById('vote-legit').disabled = false;

    } catch (error) {
        console.error("Error loading player: ", error);
        loadingDiv.innerText = "Could not load a player. Please try again later.";
    }
}

async function castVote(voteType) {
    if (!currentPlayerId) return;

    document.getElementById('vote-cheater').disabled = true;
    document.getElementById('vote-legit').disabled = true;

    const playerRef = db.collection('players').doc(currentPlayerId);

    try {
        await db.runTransaction(async (transaction) => {
            const doc = await transaction.get(playerRef);
            if (!doc.exists) {
                throw "Document does not exist!";
            }

            const fieldToIncrement = voteType === 'cheater' ? 'cheaterVotes' : 'legitVotes';
            const newVoteCount = (doc.data()[fieldToIncrement] || 0) + 1;
            
            let updateData = {};
            updateData[fieldToIncrement] = newVoteCount;
            
            const cheaterVotes = voteType === 'cheater' ? newVoteCount : doc.data().cheaterVotes || 0;
            const legitVotes = voteType === 'legit' ? newVoteCount : doc.data().legitVotes || 0;
            const totalVotes = cheaterVotes + legitVotes;
            
            if (totalVotes > 25 && (legitVotes / totalVotes) > 0.8) {
                updateData.isCleared = true;
            } else {
                updateData.isCleared = false;
            }

            transaction.update(playerRef, updateData);
            return { cheaterVotes, legitVotes, totalVotes };
        });

        const votedOnPlayers = JSON.parse(localStorage.getItem('votedOnPlayers') || '{}');
        votedOnPlayers[currentPlayerId] = voteType;
        localStorage.setItem('votedOnPlayers', JSON.stringify(votedOnPlayers));

        showResults(currentPlayerId);

    } catch (error) {
        console.error("Transaction failed: ", error);
        alert("There was an error casting your vote. Please try again.");
        document.getElementById('vote-cheater').disabled = false;
        document.getElementById('vote-legit').disabled = false;
    }
}

async function showResults(playerId) {
    const playerDoc = await db.collection('players').doc(playerId).get();
    if (!playerDoc.exists) return;

    const data = playerDoc.data();
    const cheaterVotes = data.cheaterVotes || 0;
    const legitVotes = data.legitVotes || 0;
    const totalVotes = cheaterVotes + legitVotes;

    let confidence = "No clear verdict yet.";
    if (totalVotes > 0) {
        const cheaterPercentage = Math.round((cheaterVotes / totalVotes) * 100);
        confidence = `${cheaterPercentage}% suspect the player is a cheater.`;
    }

    document.getElementById('confidence-level').innerText = confidence;
    document.getElementById('vote-counts').innerText = `Based on ${totalVotes} total votes (${cheaterVotes} Cheater, ${legitVotes} Legit).`;

    document.getElementById('player-card').style.display = 'none';
    document.getElementById('results').style.display = 'block';
}

async function updateTopCheatersList() {
    const listElement = document.getElementById('top-cheaters-list');
    try {
        const snapshot = await db.collection('players')
            .where('cheaterVotes', '>', 0)
            .get();

        let suspects = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            const totalVotes = (data.cheaterVotes || 0) + (data.legitVotes || 0);
            if (totalVotes >= 25) {
                const cheaterRatio = (data.cheaterVotes || 0) / totalVotes;
                if (cheaterRatio > 0.5) {
                    suspects.push({ id: doc.id, ...data, cheaterRatio, totalVotes });
                }
            }
        });

        suspects.sort((a, b) => b.cheaterRatio - a.cheaterRatio);

        if (suspects.length === 0) {
            listElement.innerHTML = '<li>No players meet the leaderboard criteria yet.</li>';
            return;
        }

        listElement.innerHTML = suspects.slice(0, 10).map(player => {
            const cheaterPercentage = Math.round(player.cheaterRatio * 100);
            const reportLink = `https://trials.report/report/${player.membershipType}/${player.membershipId}`;
            // CHANGE: Display the unique player ID instead of a name.
            return `
                <li>
                    <a href="${reportLink}" target="_blank">Player ID: ${player.id}</a>
                    <span class="vote-details">
                        ${cheaterPercentage}% Cheater Verdict (${player.cheaterVotes} of ${player.totalVotes} votes)
                    </span>
                </li>
            `;
        }).join('');
    } catch (error) {
        console.error("Error updating leaderboard:", error);
        listElement.innerHTML = '<li>Could not load leaderboard.</li>';
    }
}


// --- Feature 2: Submission Logic ---

async function submitLink() {
    const urlInput = document.getElementById('trials-link-input');
    const statusP = document.getElementById('submit-status');
    const url = urlInput.value.trim();
    
    // CHANGE: Removed bungieName input and logic.
    if (!url) {
        statusP.textContent = "Please provide a Trials Report URL.";
        statusP.style.color = '#ff453a';
        return;
    }
    
    const match = url.match(/trials\.report\/report\/(\d+)\/(\d+)/);

    if (!match) {
        statusP.textContent = "Invalid Trials Report URL. It should look like https://trials.report/report/3/4611...";
        statusP.style.color = '#ff453a';
        return;
    }

    const membershipType = match[1];
    const membershipId = match[2];
    const playerId = `${membershipType}-${membershipId}`;

    statusP.textContent = "Submitting...";
    statusP.style.color = '#f2f2f7';

    try {
        const playerRef = db.collection('players').doc(playerId);
        const doc = await playerRef.get();

        if (doc.exists) {
            statusP.textContent = "This player has already been submitted for review.";
            statusP.style.color = '#ff9f0a';
        } else {
            // CHANGE: Removed `bungieName` from the data being saved to Firestore.
            await playerRef.set({
                membershipType: membershipType,
                membershipId: membershipId,
                cheaterVotes: 0,
                legitVotes: 0,
                isCleared: false,
                submittedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            statusP.textContent = "Success! Player submitted for community review.";
            statusP.style.color = '#32d74b';
            urlInput.value = '';
        }
    } catch (error) {
        console.error("Error submitting link: ", error);
        statusP.textContent = "An error occurred during submission. Please try again.";
        statusP.style.color = '#ff453a';
    }
}


// --- Feature 3: Vote History Logic ---

async function loadVoteHistory() {
    const container = document.getElementById('history-container');
    const votedOnPlayers = JSON.parse(localStorage.getItem('votedOnPlayers') || '{}');
    const playerIds = Object.keys(votedOnPlayers);

    if (playerIds.length === 0) {
        container.innerHTML = "<p>You haven't voted on any players yet. Go back to the main page to start judging!</p>";
        return;
    }

    try {
        const promises = [];
        for (let i = 0; i < playerIds.length; i += 10) {
            const chunk = playerIds.slice(i, i + 10);
            promises.push(
                db.collection('players').where(firebase.firestore.FieldPath.documentId(), 'in', chunk).get()
            );
        }

        const snapshots = await Promise.all(promises);
        let html = '<ul class="history-list">';
        
        snapshots.forEach(snapshot => {
            snapshot.forEach(doc => {
                const player = { id: doc.id, ...doc.data() };
                const totalVotes = (player.cheaterVotes || 0) + (player.legitVotes || 0);
                const cheaterPercentage = totalVotes > 0 ? Math.round((player.cheaterVotes / totalVotes) * 100) : 0;
                const yourVote = votedOnPlayers[player.id];
                const yourVoteDisplay = yourVote === 'cheater' 
                    ? `<span style="color:#ff453a;">Cheater</span>` 
                    : `<span style="color:#32d74b;">Legitimate</span>`;

                const reportLink = `https://trials.report/report/${player.membershipType}/${player.membershipId}`;

                // CHANGE: Display the player's unique ID instead of a name.
                html += `
                    <li class="history-item">
                        <a href="${reportLink}" class="history-item-name" target="_blank">Player ID: ${player.id}</a>
                        <div class="vote-details">
                            Community Verdict: ${cheaterPercentage}% Cheater (${player.cheaterVotes} of ${totalVotes} votes)
                        </div>
                        <div class="my-vote">Your Vote: ${yourVoteDisplay}</div>
                    </li>
                `;
            });
        });
        
        html += '</ul>';
        container.innerHTML = html;

    } catch (error) {
        console.error("Error loading vote history:", error);
        container.innerHTML = '<p>Could not load your vote history. Please try again later.</p>';
    }
}
// --- END OF FILE Crowdsourced-Trials-Demo-main/app.js ---
