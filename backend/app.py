import requests
from flask import Flask, request, jsonify

app = Flask(__name__)

# PhishTank API URL and Key
PHISHTANK_API_URL = "https://checkurl.phishtank.com/checkurl/index.php"
PHISHTANK_API_KEY = "your_phishtank_api_key_here"

def check_phishing(domain):
    """Check if a domain is a phishing domain using PhishTank API."""
    try:
        # Prepare the payload
        params = {
            "url": domain,
            "apikey": PHISHTANK_API_KEY
        }
        
        # Send request to PhishTank API
        response = requests.get(PHISHTANK_API_URL, params=params)
        
        # Check the response
        if response.status_code == 200:
            data = response.json()
            if 'data' in data and 'url' in data['data']:
                # Check if the domain is marked as phishing
                if data['data']['url']['phish'] == 'true':
                    return {'is_phishing': True, 'message': 'This domain is flagged as phishing.'}
                else:
                    return {'is_phishing': False, 'message': 'This domain is not phishing.'}
            else:
                return {'is_phishing': False, 'message': 'PhishTank API did not return valid data.'}
        else:
            return {'is_phishing': False, 'message': 'Error checking domain with PhishTank.'}
    
    except Exception as e:
        return {'is_phishing': False, 'message': f'An error occurred: {str(e)}'}

@app.route('/api/phishing/check', methods=['POST'])
def phishing_check():
    """API route to check if a domain is phishing."""
    data = request.json
    domain = data.get('domain', '').strip()
    
    if not domain:
        return jsonify({'error': 'Domain is required'}), 400
    
    # Call phishing check function
    result = check_phishing(domain)
    
    return jsonify(result)

if __name__ == '__main__':
    app.run(debug=True)
