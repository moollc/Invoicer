# moo Invoicer

A lightweight, offline-first invoice generation and ledger tracking tool. Works standalone in your browser with no server required.

## Features

- **Quick Invoice Generation** - Create professional invoices in seconds
- **Offline-First** - Works without internet; syncs when back online
- **PWA Support** - Install as an app on desktop or mobile
- **PDF Export** - Download invoices as PDF files
- **Ledger Tracking** - Keep tabs on all your invoices
- **Local Storage** - Your data stays on your device

## Installation

### Web
Open `index.html` in any modern web browser.

### PWA (Recommended)
1. Open the tool in your browser
2. Click the install prompt (browser-dependent) or use the menu → "Install app"
3. Access it like any other installed application

## How to Use

### Creating an Invoice

1. **Load or Create Data** - The tool expects JSON invoice data in the HTML comment block near the top of `index.html`. You can:
   - Edit the JSON manually
   - Ask Gemini/Deepseek/Claude etc to update the invoice data for you
   
2. **Fill in the Details:**
   - `date` - Auto-sets to today (DD/MM/YYYY format)
   - `receiptNumber` - Auto-generated from date + letter suffix (A, B, C...)
   - `currency` - Three-letter code (JMD, USD, EUR, etc.)
   - `from` - Your company/personal details (name, address)
   - `to` - Client/customer details
   - `items` - Services or products with descriptions and amounts
   - `notes` - Optional payment terms, thank you message, etc.

3. **Preview** - The invoice renders live as you update the JSON

4. **Export** - Click "Download PDF" to save your invoice

### Managing Your Ledger

- All invoices are stored in your browser's local storage
- Access your invoice history from the ledger view
- Search and filter by date, client, or amount

## Browser Support

- Chrome/Edge 90+
- Firefox 88+
- Safari 14+
- Mobile browsers on iOS/Android

## Offline Usage

This tool works completely offline. Once loaded, you can:
- Create new invoices
- Export to PDF
- View your ledger history

Your data syncs when you reconnect to the internet.

## Tips

- **Keyboard Shortcuts** - Use Tab to navigate fields quickly
- **Multiple Invoices** - Create multiple invoices in one session; each gets a unique receipt number
- **Custom Currencies** - Any three-letter currency code works (including cryptocurrency: BTC, ETH, etc.)
- **Mobile Friendly** - Optimized for phone and tablet use

## Privacy & Data

All your invoice data is stored **only on your device**. Nothing is sent to a server. Your data is private and secure.

## License

Proprietary. All rights reserved.
