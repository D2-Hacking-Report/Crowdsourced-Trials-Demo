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
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const db = firebase.firestore();

// --- Global State ---
let currentPlayerId = null;

// --- Core Application Logic ---

/**
 * Loads a random player from Firestore for voting, excluding players
 * who are overwhelmingly voted as "legitimate".
 */
async function loadRandomPlayer() {
    // Reset the UI to a loading state
    const loadingDiv = document.getElementById('loading');
    const playerCardDiv = document.getElementById('player-card');
    const resultsDiv = document.getElementById('results');

    if (loadingDiv) loadingDiv.style.display = 'block';
    if (playerCardDiv) playerCardDiv.style.display = 'none';
    if (resultsDiv) resultsDiv.style.display = 'none';

    try {
        const playersRef = db.collection('players');
        const snapshot = await playersRef.get();

        if (snapshot.empty) {
            if (loadingDiv) loadingDiv.innerText = 'No players have been submitted yet.';
            return;
        }

        // Filter players to find ones eligible for voting
        const votablePlayers = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            const cheaterVotes = data.cheater_votes || 0;
            const legitVotes = data.legit_votes || 0;
            const totalVotes = cheaterVotes + legitVotes;

            // **NEW LOGIC**: A player is removed from the pool if they have:
            // 1. More than 25 total votes AND
            // 2. More than 80% of votes are "legit"
            const isClearlyLegit = totalVotes > 25 && (legitVotes / totalVotes) > 0.8;

            // If the player is NOT clearly legit, add them to the votable pool
            if (!isClearlyLegit) {
                votablePlayers.push({ id: doc.id, ...data });
            }
        });

        if (votablePlayers.length === 0) {
            if (loadingDiv) loadingDiv.innerText = 'All available players have been reviewed. Try submitting a new one!';
            return;
        }

        // Select a random player from the filtered list
        const randomIndex = Math.floor(Math.random() * votablePlayers.length);
        const player = votablePlayers[randomIndex];
        currentPlayerId = player.id;

        // Populate the player card
        const playerLinkEl = document.getElementById('player-link-display');
        const playerDisplayName = player.bungieName.split('#')[0]; // Show name without the # numbers for brevity
        playerLinkEl.href = `https://trials.report/report/${player.platform}/${player.bungieName}`;
        playerLinkEl.textContent = `View ${playerDisplayName} on Trials Report`;

        // Show the card and enable voting buttons
        if (loadingDiv) loadingDiv.style.display = 'none';
        if (playerCardDiv) playerCardDiv.style.display = 'block';
        document.getElementById('vote-cheater').disabled = false;
        document.getElementById('vote-legit').disabled = false;

    } catch (error) {
        console.error("Error loading random player:", error);
        if (loadingDiv) loadingDiv.innerText = 'Error loading player. Please try again.';
    }
}

/**
 * Casts a vote for the current player and stores it in Firestore.
 * @param {string} voteType - Can be 'cheater' or 'legit'.
 */
async function castVote(voteType) {
    if (!currentPlayerId) return;

    // Disable buttons to prevent multiple votes
    document.getElementById('vote-cheater').disabled = true;
    document.getElementById('vote-legit').disabled = true;

    const playerRef = db.collection('players').doc(currentPlayerId);
    const voteField = voteType === 'cheater' ? 'cheater_votes' : 'legit_votes';

    try {
        // Use a transaction to safely increment the vote count
        await playerRef.update({
            [voteField]: firebase.firestore.FieldValue.increment(1)
        });
        showResults();
        updateTopCheatersList(); // Refresh leaderboard after a vote

    } catch (error) {
        console.error("Error casting vote:", error);
        alert("There was an error casting your vote. Please try again.");
        // Re-enable buttons if the vote failed
        document.getElementById('vote-cheater').disabled = false;
        document.getElementById('vote-legit').disabled = false;
    }
}

/**
 * Fetches the latest vote counts for the current player and displays them.
 */
async function showResults() {
    const playerRef = db.collection('players').doc(currentPlayerId);
    const doc = await playerRef.get();
    
    if (!doc.exists) return;

    const data = doc.data();
    const cheaterVotes = data.cheater_votes || 0;
    const legitVotes = data.legit_votes || 0;
    const totalVotes = cheaterVotes + legitVotes;

    let confidenceText = "No votes have been cast yet.";
    if (totalVotes > 0) {
        const cheaterPercentage = Math.round((cheaterVotes / totalVotes) * 100);
        if (cheaterPercentage >= 25) {
            confidenceText = `Community considers this player a <strong>cheater</strong> with <strong>${cheaterPercentage}%</strong> confidence.`;
        } else {
            const legitPercentage = 100 - cheaterPercentage;
            confidenceText = `Community considers this player <strong>legitimate</strong> with <strong>${legitPercentage}%</strong> confidence.`;
        }
    }

    document.getElementById('confidence-level').innerHTML = confidenceText;
    document.getElementById('vote-counts').innerText = `(${cheaterVotes} cheater votes, ${legitVotes} legit votes)`;

    document.getElementById('player-card').style.display = 'none';
    document.getElementById('results').style.display = 'block';
}

/**
 * Updates the leaderboard of top suspected cheaters.
 */
async function updateTopCheatersList() {
    const listElement = document.getElementById('top-cheaters-list');
    if (!listElement) return; // Don't run on submit page
    
    listElement.innerHTML = '<li>Loading leaderboard...</li>';

    try {
        // This query fetches all documents to be filtered client-side.
        // For larger datasets, a more advanced solution with Cloud Functions might be needed.
        const snapshot = await db.collection('players').get();

        let suspectedPlayers = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            const cheaterVotes = data.cheater_votes || 0;
            const legitVotes = data.legit_votes || 0;
            const totalVotes = cheaterVotes + legitVotes;

            if (totalVotes >= 25) {
                const cheaterPercentage = cheaterVotes / totalVotes;
                if (cheaterPercentage > 0.5) {
                    suspectedPlayers.push({
                        ...data,
                        totalVotes: totalVotes,
                        cheaterPercentage: cheaterPercentage
                    });
                }
            }
        });

        // Sort by cheater percentage (descending)
        suspectedPlayers.sort((a, b) => b.cheaterPercentage - a.cheaterPercentage);
        const topPlayers = suspectedPlayers.slice(0, 10);

        if (topPlayers.length === 0) {
            listElement.innerHTML = '<li>No players currently meet the leaderboard criteria.</li>';
            return;
        }

        listElement.innerHTML = ''; // Clear loading message
        topPlayers.forEach(player => {
            const playerLink = `https://trials.report/report/${player.platform}/${player.bungieName}`;
            const percentage = Math.round(player.cheaterPercentage * 100);
            const listItem = document.createElement('li');
            listItem.innerHTML = `
                <a href="${playerLink}" target="_blank">${player.bungieName}</a>
                <span class="vote-details">${percentage}% cheater votes (${player.totalVotes} total votes)</span>
            `;
            listElement.appendChild(listItem);
        });

    } catch (error) {
        console.error("Error updating leaderboard:", error);
        listElement.innerHTML = '<li>Error loading leaderboard.</li>';
    }
}

/**
 * Submits a new player link from the submit.html page.
 */
async function submitLink() {
    const inputElement = document.getElementById('trials-link-input');
    const statusElement = document.getElementById('submit-status');
    const url = inputElement.value.trim();

    if (!url) {
        statusElement.textContent = "Please enter a URL.";
        statusElement.style.color = '#ff453a'; // red
        return;
    }

    // Regex to parse Trials Report URL: https://trials.report/report/{platformId}/{bungieName}
    const match = url.match(/trials\.report\/report\/(\d+)\/(.+)/);
    if (!match || match.length < 3) {
        statusElement.textContent = "Invalid Trials Report URL format.";
        statusElement.style.color = '#ff453a';
        return;
    }

    const platform = match[1];
    const bungieName = decodeURIComponent(match[2]); // Decode URL-encoded characters like %23 for #

    statusElement.textContent = "Submitting...";
    statusElement.style.color = '#f2f2f7';

    try {
        // Use a consistent ID to prevent duplicate entries
        const docId = `${platform}-${bungieName.replace('#', '-')}`;
        const playerRef = db.collection('players').doc(docId);

        const doc = await playerRef.get();
        if (doc.exists) {
            statusElement.textContent = "This player has already been submitted.";
            statusElement.style.color = '#ffd60a'; // yellow
            return;
        }

        await playerRef.set({
            bungieName: bungieName,
            platform: platform,
            cheater_votes: 0,
            legit_votes: 0,
            submittedAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        statusElement.textContent = "Success! Player submitted for review.";
        statusElement.style.color = '#32d74b'; // green
        inputElement.value = '';

    } catch (error) {
        console.error("Error submitting link:", error);
        statusElement.textContent = "An error occurred. Please try again.";
        statusElement.style.color = '#ff453a';
    }
}
