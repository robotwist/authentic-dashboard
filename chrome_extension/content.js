// content.js

function detectBuzzwords() {
    const buzzwords = [
      'disruptive',
      'synergy',
      'AI-powered',
      'revolutionary',
      'blockchain',
      'scalable',
      'innovative',
      'game-changer',
      'next-gen',
      'machine learning',
      'crypto',
      'unicorn',
      'deep tech',
      'solution-driven'
    ];
  
    const pageText = document.body.innerText.toLowerCase();
    let count = 0;
  
    buzzwords.forEach(word => {
      const regex = new RegExp(`\\b${word}\\b`, 'gi');
      const matches = pageText.match(regex);
      if (matches) count += matches.length;
    });
  
    return {
      behavior_type: "buzzwords",
      count
    };
  }
  
  // Run immediately on page load
  const result = detectBuzzwords();
  console.log("Buzzwords detected:", result.count);
  
  fetch("http://localhost:8000/api/log/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      domain: window.location.origin,
      behavior_type: result.behavior_type,
      count: result.count
    })
  })
    .then(res => res.json())
    .then(data => console.log("Logged to Django:", data))
    .catch(err => console.error("Error logging behavior:", err));
  