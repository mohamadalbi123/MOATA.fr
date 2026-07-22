# MOATA Prototype

MOATA stands for Management of Automated Tasks.

This static prototype presents one core product:

- AI diagnostic assistants that help customers choose the right service before booking.

The current prototype lets a business owner:

- choose an industry
- pick an assistant avatar
- select question cards based on the industry
- add business details, booking URL, service list, and safety rules
- save a local assistant setup
- open a simple dashboard with a public diagnostic preview link and embed-code example

## Launch Checklist

- Connect real signup/login with Google OAuth.
- Add a database for businesses, assistants, services, questions, and submissions.
- Add secure file storage for customer photos and documents.
- Connect an LLM API so the assistant can recommend only services the business offers.
- Add Stripe checkout and subscription/payment status.
- Replace the prototype embed code domain with the live MOATA domain.
- Add email notifications for new assistant requests and customer diagnostic submissions.
- Review privacy, terms, cookies, and AI safety wording before launch.

## Pages

- `index.html` - homepage overview.
- `services.html` - platform overview page.
- `ai-diagnostic.html` - AI diagnostic assistant page.
- `lazoya-example.html` - Product use case and diagnostic demo.
- `process.html` - step-by-step client journey.
- `contact.html` - contact/start page.
- `request.html` - assistant builder wizard.
- `signup.html` - prototype signup page.
- `login.html` - prototype login page.
- `dashboard.html` - prototype assistant dashboard.
- `assistant.html` - standalone public diagnostic preview.

## Files

- `styles.css` - full site styling.
- `script.js` - builder, local assistant storage, dashboard, and preview logic.
- `widget.js` - prototype website widget launcher.
- `assets/moata-logo.svg` - MOATA logo mark.
- `assets/lazoya-diagnostic-demo-final.mov` - Lazoya diagnostic walkthrough video.
- `assets/avatar-female-white.png` - female assistant avatar in white outfit.
- `assets/avatar-male-white.png` - male assistant avatar in white outfit.
- `assets/avatar-female-casual.png` - female assistant avatar in casual outfit.
- `assets/avatar-male-casual.png` - male assistant avatar in casual outfit.
