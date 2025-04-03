// sensors/buzzwords.js

export function detectBuzzwords() {
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
  