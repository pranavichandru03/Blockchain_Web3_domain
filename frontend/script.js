async function checkPhishing() {
    const domain = document.getElementById('domainInput').value;
    if (!domain) return;
  
    try {
      const response = await fetch('http://localhost:3000/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain })
      });
  
      const data = await response.json();
      
      if (data.reply) {
        document.getElementById('domainResult').innerHTML = `<p>${data.reply}</p>`;
      } else {
        document.getElementById('domainResult').innerHTML = '<p>Unable to check phishing status.</p>';
      }
    } catch (error) {
      console.error('Error:', error);
      document.getElementById('domainResult').innerHTML = 'Error checking phishing status.';
    }
  }
  
  async function askChatbot() {
    const message = document.getElementById('messageInput').value;
    if (!message) return;
  
    try {
      const response = await fetch('http://localhost:3000/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message })
      });
  
      const data = await response.json();
  
      if (data.reply) {
        document.getElementById('chatResult').innerHTML = `<p>${data.reply}</p>`;
      } else {
        document.getElementById('chatResult').innerHTML = '<p>Unable to get a response from the chatbot.</p>';
      }
    } catch (error) {
      console.error('Error:', error);
      document.getElementById('chatResult').innerHTML = 'Error fetching chatbot response.';
    }
  }
  