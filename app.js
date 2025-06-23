// --- FIREBASE CONFIGURATION ---
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
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

// Global variable to hold the current player's data
let currentPlayer = null;

// --- SUBMISSION LOGIC (for submit.html) ---

async function submitLink() {
    const linkInput = document.getElementById('trials-link-input');
    const statusEl = document.getElementById('submit-status');
    const trialsLink = linkInput.value.trim();

    if (!trialsLink.startsWith("https://trials.report/report/")) {
        statusEl.textContent = "Error: Please enter a valid Trials Report URL.";
        return;
    }

    statusEl.textContent = "Submitting...";

    try {
        const urlParts = trialsLink.split('/');
        if (urlParts.length < 5) throw new Error("Invalid URL format.");
        
        const uniqueId = `${urlParts[urlParts.length - 2]}-${urlParts[urlParts.length - 1]}`;

        await db.collection('players').doc(uniqueId).set({
            trialsLink: trialsLink,
            votes_cheater: 0,
            votes_legit: 0,
            submitted_at: new Date()
        }, { merge: true });

        statusEl.textContent = `Success! The link has been added to the review queue.`;
        linkInput.value = '';

    } catch (error) {
        statusEl.textContent = `Error: ${error.message}`;
    }
}

// --- JUDGMENT LOGIC (for index.html) ---

async function loadRandomPlayer() {
    document.getElementById('loading').style.display = 'block';
    document.getElementById('player-card').style.display = 'none';
    document.getElementById('results').style.display = 'none';

    try {
        const snapshot = await db.collection('players').get();
        if (snapshot.empty) {
            document.getElementById('loading').textContent = "No players in the queue. Submit one!";
            return;
        }

        const votedIDs = JSON.parse(localStorage.getItem('votedPlayerIDs') || '[]');
        const availablePlayers = snapshot.docs.filter(doc => !votedIDs.includes(doc.id));

        if (availablePlayers.length === 0) {
            document.getElementById('loading').innerHTML = "Wow, you've voted on everyone!<br>Check back later for new submissions.";
            return;
        }

        const randomDoc = availablePlayers[Math.floor(Math.random() * availablePlayers.length)];
        currentPlayer = { id: randomDoc.id, ...randomDoc.data() };
        renderPlayerCard(currentPlayer);

    } catch (error) {
        console.error("Error loading random player:", error);
        document.getElementById('loading').textContent = "Error loading player. Please refresh.";
    }
}

function renderPlayerCard(playerData) {
    const linkDisplay = document.getElementById('player-link-display');
    linkDisplay.href = playerData.trialsLink;
    
    document.getElementById('loading').style.display = 'none';
    document.getElementById('player-card').style.display = 'block';
    document.getElementById('vote-cheater').disabled = false;
    document.getElementById('vote-legit').disabled = false;
    document.getElementById('results').style.display = 'none';
}

async function castVote(voteType) {
    const cheaterButton = document.getElementById('vote-cheater');
    const legitButton = document.getElementById('vote-legit');
    cheaterButton.disabled = true;
    legitButton.disabled = true;

    try {
        const fieldToIncrement = `votes_${voteType}`;
        const playerRef = db.collection('players').doc(currentPlayer.id);
        
        await playerRef.update({
            [fieldToIncrement]: firebase.firestore.FieldValue.increment(1)
        });

        const votedHistory = JSON.parse(localStorage.getItem('votedPlayerIDs') || '[]');
        if (!votedHistory.includes(currentPlayer.id)) {
            votedHistory.push(currentPlayer.id);
        }
        localStorage.setItem('votedPlayerIDs', JSON.stringify(votedHistory));

        await showResults();

    } catch (error) {
        console.error("Error casting vote:", error);
        alert("Could not cast vote. Check console for details.");
        cheaterButton.disabled = false;
        legitButton.disabled = false;
    }
}

async function showResults() {
    try {
        const updatedDoc = await db.collection('players').doc(currentPlayer.id).get();
        const data = updatedDoc.data();

        const cheaterVotes = data.votes_cheater || 0;
        const legitVotes = data.votes_legit || 0;
        const totalVotes = cheaterVotes + legitVotes;
        const confidence = totalVotes === 0 ? 0 : (cheaterVotes / totalVotes * 100);

        document.getElementById('confidence-level').textContent = 
            `Confidence Level: ${confidence.toFixed(1)}% believe this player is cheating.`;
        document.getElementById('vote-counts').textContent = 
            `Based on ${totalVotes} votes (${cheaterVotes} for cheater, ${legitVotes} for legit).`;

        document.getElementById('results').style.display = 'block';

        await updateTopCheatersList();

    } catch (error) {
        console.error("Error showing results:", error);
    }
}

async function updateTopCheatersList() {
    const listElement = document.getElementById('top-cheaters-list');
    listElement.innerHTML = '<li>Loading leaderboard...</li>';

    try {
        const snapshot = await db.collection('players').get();
        const players = [];
        snapshot.forEach(doc => {
            players.push({ id: doc.id, ...doc.data() });
        });

        const candidates = players.filter(p => {
            // This defensive code prevents crashes from malformed data.
            // It provides a default value of 0 if a field is missing.
            const cheaterVotes = p.votes_cheater || 0;
            const legitVotes = p.votes_legit || 0;
            const totalVotes = cheaterVotes + legitVotes;
            
            const cheaterPercentage = totalVotes > 0 ? (cheaterVotes / totalVotes) : 0;
            
            return totalVotes >= 25 && cheaterPercentage > 0.5;
        });

        // Also make the sort function defensive.
        candidates.sort((a, b) => (b.votes_cheater || 0) - (a.votes_cheater || 0));

        const topPlayers = candidates.slice(0, 10);

        // This line will now be reached because the function won't crash.
        listElement.innerHTML = '';

        if (topPlayers.length === 0) {
            listElement.innerHTML = '<li>No players currently meet the criteria.</li>';
        } else {
            topPlayers.forEach(player => {
                // Use the same defensive variables for rendering.
                const cheaterVotes = player.votes_cheater || 0;
                const legitVotes = player.votes_legit || 0;
                const totalVotes = cheaterVotes + legitVotes;
                const confidence = (cheaterVotes / totalVotes * 100).toFixed(1);

                const listItem = document.createElement('li');
                listItem.innerHTML = `
                    <a href="${player.trialsLink}" target="_blank">View on Trials Report</a>
                    <span class="vote-details">
                        ${cheaterVotes} Cheater Votes (${confidence}%) out of ${totalVotes} total.
                    </span>
                `;
                listElement.appendChild(listItem);
            });
        }
    } catch (error) {
        // This catch block will report any other unexpected errors.
        console.error("Failed to update top cheaters list:", error);
        listElement.innerHTML = '<li>Error loading leaderboard. Please check the console.</li>';
    }
}
