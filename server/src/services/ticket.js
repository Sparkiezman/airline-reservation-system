'use strict';
const PDFDocument = require('pdfkit');

const BRAND_PURPLE = '#7c3aed';
const DARK = '#14121f';
const MUTED = '#6b7280';

function formatDateTime(dt) {
    return new Date(dt).toLocaleString('en-US', {
        weekday: 'short', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit'
    });
}

/**
 * Streams a boarding-pass style e-ticket PDF directly to the given writable
 * stream (typically the HTTP response). Only data already authorized for
 * this viewer should be passed in — this function does no access control.
 */
function streamETicket(res, booking) {
    const doc = new PDFDocument({ size: [432, 648], margin: 0 });
    doc.pipe(res);

    // Header band
    doc.rect(0, 0, 432, 110).fill(DARK);
    doc.fillColor('#ffffff').fontSize(22).font('Helvetica-Bold')
        .text('E-TICKET / BOARDING PASS', 24, 30);
    doc.fillColor(BRAND_PURPLE).fontSize(11).font('Helvetica')
        .text('Airline Reservation System', 24, 60);
    doc.fillColor('#ffffff').fontSize(10)
        .text(`Booking Ref: ${booking.bookingRef}`, 24, 80);

    let y = 130;
    doc.fillColor(DARK).fontSize(28).font('Helvetica-Bold')
        .text(booking.flight.originCode, 24, y);
    doc.fontSize(14).font('Helvetica').fillColor(MUTED)
        .text(booking.flight.originCity || '', 24, y + 34);

    doc.fontSize(16).fillColor(BRAND_PURPLE).text('→', 190, y + 5);

    doc.fontSize(28).font('Helvetica-Bold').fillColor(DARK)
        .text(booking.flight.destinationCode, 320, y, { width: 90, align: 'right' });
    doc.fontSize(14).font('Helvetica').fillColor(MUTED)
        .text(booking.flight.destinationCity || '', 220, y + 34, { width: 190, align: 'right' });

    y += 80;
    doc.moveTo(24, y).lineTo(408, y).strokeColor('#e5e7eb').stroke();
    y += 20;

    const rows = [
        ['Flight', booking.flight.flightNumber],
        ['Departure', formatDateTime(booking.flight.departureTime)],
        ['Arrival', formatDateTime(booking.flight.arrivalTime)],
        ['Gate', booking.flight.gate || '--'],
        ['Terminal', booking.flight.terminal || '--'],
        ['Status', booking.status.toUpperCase()]
    ];
    doc.fontSize(11).font('Helvetica');
    for (const [label, value] of rows) {
        doc.fillColor(MUTED).text(label, 24, y, { width: 150 });
        doc.fillColor(DARK).font('Helvetica-Bold').text(String(value), 180, y, { width: 228 });
        doc.font('Helvetica');
        y += 22;
    }

    y += 10;
    doc.moveTo(24, y).lineTo(408, y).strokeColor('#e5e7eb').stroke();
    y += 20;

    doc.fontSize(13).font('Helvetica-Bold').fillColor(DARK).text('Passengers', 24, y);
    y += 22;
    for (const p of booking.passengers) {
        doc.fontSize(11).font('Helvetica').fillColor(DARK)
            .text(`${p.firstName} ${p.lastName}`, 24, y, { width: 220 });
        doc.fillColor(BRAND_PURPLE).font('Helvetica-Bold')
            .text(`Seat ${p.seatNumber} · ${p.class.toUpperCase()}`, 250, y, { width: 158, align: 'right' });
        y += 20;
    }

    y += 20;
    doc.fontSize(11).fillColor(MUTED).font('Helvetica')
        .text(`Total Paid: ${(booking.totalPriceCents / 100).toFixed(2)} ${booking.currency}`, 24, y);

    // Barcode-style footer (visual only — not a real scannable barcode)
    const barcodeY = 560;
    doc.rect(0, barcodeY - 20, 432, 88).fill(DARK);
    let bx = 24;
    const seedStr = booking.bookingRef.padEnd(20, '0');
    for (let i = 0; i < 60; i++) {
        const w = 1 + (seedStr.charCodeAt(i % seedStr.length) % 3);
        if (i % 2 === 0) doc.rect(bx, barcodeY, w, 40).fill('#ffffff');
        bx += w + 2;
    }
    doc.fillColor('#ffffff').fontSize(9).font('Helvetica')
        .text(booking.bookingRef, 24, barcodeY + 48, { width: 384, align: 'center' });

    doc.end();
}

module.exports = { streamETicket };
