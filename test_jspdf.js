import { jsPDF } from 'jspdf';
const pdf = new jsPDF();
const imgData = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const props = pdf.getImageProperties(imgData);
console.log(props);
