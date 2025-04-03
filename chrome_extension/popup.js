document.getElementById("runSensor").addEventListener("click", () => {
    const selectedSensor = document.getElementById("sensorSelect").value;
  
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: runSelectedSensor,
        args: [selectedSensor]
      }, (results) => {
        const result = results[0].result;
        document.getElementById("result").innerText = 
          `${result.behavior_type} count: ${result.count}`;
  
        // POST to Django
        fetch("http://localhost:8000/api/log/", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            domain: new URL(tab.url).origin,
            behavior_type: result.behavior_type,
            count: result.count
          })
        })
          .then(res => res.json())
          .then(data => console.log("Logged to Django:", data))
          .catch(err => console.error("Log failed:", err));
      });
    });
  });
  
  function runSelectedSensor(sensorName) {
    if (sensorName === "buzzwords") {
      const buzzwords = [
        'disruptive', 'synergy', 'AI-powered', 'revolutionary',
        'blockchain', 'scalable', 'innovative', 'game-changer',
        'next-gen', 'machine learning', 'crypto', 'unicorn',
        'deep tech', 'solution-driven'
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
  
    return { behavior_type: sensorName, count: 0 };
  }
  