function collectInstagramPosts() {
  const posts = [];

  // Instagram post containers
  const postElements = document.querySelectorAll('article');

  postElements.forEach((el) => {
    const content = el.innerText || "";
    const username = el.querySelector('header a')?.innerText || "unknown";

    if (content.length > 0) {
      posts.push({
        content,
        platform: 'instagram',
        user: username,
        is_friend: true,     // eventually use better logic
        is_family: false,
        category: '',        // you can tag these later!
      });
    }
  });

  posts.forEach(post => {
    fetch("http://localhost:8000/api/post/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(post)
    })
    .then(res => res.json())
    .then(data => console.log("Post saved:", data))
    .catch(err => console.error("Error sending post:", err));
  });
}

// Run when page loads
window.addEventListener("load", collectInstagramPosts);
function collectFacebookPosts() {
  const posts = [];

  // Typical FB post containers
  const postElements = document.querySelectorAll('[role="article"]');

  postElements.forEach((el) => {
    const content = el.innerText || "";
    const user = el.querySelector('h4 span strong, h4 span a')?.innerText || "unknown";
    const isSponsored = content.includes("Sponsored") || el.innerHTML.includes("Sponsored");

    if (content.length > 50) {
      posts.push({
        content,
        platform: 'facebook',
        user,
        is_friend: true,
        is_family: false,
        category: isSponsored ? "sponsored" : "", // Store ad status in category
      });
    }
  });

  posts.forEach(post => {
    fetch("http://localhost:8000/api/post/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(post)
    })
    .then(res => res.json())
    .then(data => console.log("FB post saved:", data))
    .catch(err => console.error("Error sending FB post:", err));
  });
}

window.addEventListener("load", () => {
  collectFacebookPosts();
});
