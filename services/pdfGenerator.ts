import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Requisition } from '../types';
import { fetchDriveImage } from './googleSheets';
import { todeschiniLogo } from '../utils/assets';

// Imagem exata do Logo Todeschini (Texto Cinza + Coração Vermelho)
const logoBase64 = todeschiniLogo;

export const generateRequisitionPDF = async (originalData: Requisition) => {
  // Copia profunda para não alterar o estado original da tela
  const data = JSON.parse(JSON.stringify(originalData)) as Requisition;

  // --- Pré-processamento: Baixar Imagens do Drive se necessário ---
  if (data.photos && data.photos.length > 0) {
    console.log("Iniciando download de imagens para PDF...");
    for (let i = 0; i < data.photos.length; i++) {
      const photo = data.photos[i];
      // Se não tem dataUrl (base64) mas tem URL (link), tenta buscar do servidor
      if ((!photo.dataUrl || photo.dataUrl.length < 100) && photo.url) {
        try {
          console.log(`Baixando foto ${i+1} de: ${photo.url}`);
          const base64FromServer = await fetchDriveImage(photo.url);
          if (base64FromServer) {
            photo.dataUrl = base64FromServer;
            console.log(`Foto ${i+1} baixada com sucesso!`);
          } else {
            console.warn(`Falha ao baixar foto ${i+1}. O link será exibido no lugar.`);
          }
        } catch (e) {
          console.error("Exceção ao baixar imagem para PDF", e);
        }
      }
    }
  }

  // --- Geração do PDF ---
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  
  const drawRect = (x: number, y: number, w: number, h: number) => {
    doc.setDrawColor(0);
    doc.setLineWidth(0.1);
    doc.rect(x, y, w, h);
  };

  const getFormattedDate = (dateString: string) => {
    if (!dateString) return "--/--/----";
    try {
       // Tenta criar objeto Date
       let d = new Date(dateString);
       
       // Se for inválido ou for string antiga YYYY-MM-DD
       if (isNaN(d.getTime())) {
          if (dateString.includes('-')) {
             const parts = dateString.split('-');
             if (parts.length === 3) {
                // assume YYYY-MM-DD
                return `${parts[2]}/${parts[1]}/${parts[0]}`;
             }
          }
          return dateString;
       }
       
       const day = String(d.getDate()).padStart(2, '0');
       const month = String(d.getMonth() + 1).padStart(2, '0');
       const year = d.getFullYear();
       return `${day}/${month}/${year}`;
    } catch(e) {
       return dateString;
    }
  }

  // --- Cabeçalho ---
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  const title = data.type === 'Fábrica' ? "REQUISIÇÃO DE FÁBRICA" : "REQUISIÇÃO DE SERVIÇOS";
  doc.text(title, 14, 15);
  doc.text(data.requisitionNumber, 90, 15);

  try {
     const logoWidth = 50; 
     const logoHeight = 12; 
     doc.addImage(logoBase64, 'PNG', pageWidth - 14 - logoWidth, 6, logoWidth, logoHeight);
  } catch (e) {
    console.error("Erro ao adicionar logo", e);
    doc.setTextColor(227, 6, 19);
    doc.setFontSize(22);
    doc.text("Todeschini", pageWidth - 14, 15, { align: "right" });
    doc.setTextColor(0);
  }

  doc.setTextColor(0);

  // --- Grid de Informações ---
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  
  drawRect(14, 20, 25, 8); 
  doc.text("Data", 16, 25);
  drawRect(39, 20, 40, 8); 
  doc.text(getFormattedDate(data.date), 41, 25);

  let currentY = 32;
  drawRect(14, currentY, 25, 8);
  doc.text("Cliente", 16, currentY + 5);
  drawRect(39, currentY, 80, 8);
  doc.text(data.clientName, 41, currentY + 5);
  
  if (data.type === 'Produção') {
    drawRect(119, currentY, 25, 8);
    doc.text("Ambiente", 121, currentY + 5);
    drawRect(144, currentY, pageWidth - 158, 8); 
    doc.text(data.environment, 146, currentY + 5);
  }

  currentY += 8;

  drawRect(14, currentY, 25, 8);
  doc.text("Montador", 16, currentY + 5);
  drawRect(39, currentY, 80, 8);
  doc.text(data.fitter, 41, currentY + 5);
  
  if (data.type === 'Produção') {
    drawRect(119, currentY, 30, 8);
    doc.text("Ordem Compra", 121, currentY + 5);
    drawRect(149, currentY, pageWidth - 163, 8);
    doc.text(data.purchaseOrder, 151, currentY + 5);
  }

  currentY += 8;

  drawRect(14, currentY, 55, 8);
  doc.text("Responsável pela informação", 16, currentY + 5);
  drawRect(69, currentY, 50, 8);
  doc.text(data.responsible, 71, currentY + 5);

  currentY += 15;

  // --- Tabelas ---
  doc.setFont("helvetica", "bold");
  const tableTitle = data.type === 'Fábrica' ? "PEÇAS DE FÁBRICA (BATIDAS/FALTANTES/MEDIDA ERRADA)" : "SERVIÇO PARA EXECUÇÃO OU AJUSTES";
  doc.text(tableTitle, pageWidth / 2, currentY, { align: "center" });
  
  const serviceBody = data.services.map(s => {
    if (data.type === 'Fábrica') {
      return [s.quantity, s.specification, s.color || '', s.reason || '', s.description];
    }
    return [s.quantity, s.specification, s.description, s.volume];
  });

  if (serviceBody.length === 0) {
    serviceBody.push(data.type === 'Fábrica' ? ['', '', '', '', ''] : ['', '', '', '']);
  }

  autoTable(doc, {
    startY: currentY + 2,
    head: [data.type === 'Fábrica' ? ['Qtd', 'Medida', 'Cor', 'Motivo', 'Descrição'] : ['Quantidade', 'Especificação', 'Descrição', 'Volume']],
    body: serviceBody,
    theme: 'grid',
    headStyles: { fillColor: [220, 220, 220], textColor: 0, fontStyle: 'bold', lineColor: 0, lineWidth: 0.1 },
    styles: { lineColor: 0, lineWidth: 0.1, textColor: 0 },
    columnStyles: data.type === 'Fábrica' ? {
      0: { cellWidth: 15 },
      1: { cellWidth: 30 },
      2: { cellWidth: 30 },
      3: { cellWidth: 30 },
      4: { cellWidth: 'auto' }
    } : {
      0: { cellWidth: 25 },
      1: { cellWidth: 40 },
      2: { cellWidth: 'auto' },
      3: { cellWidth: 25 }
    },
    margin: { left: 14, right: 14 }
  });

  // @ts-ignore
  let finalY = doc.lastAutoTable.finalY + 10;

  if (data.type === 'Produção') {
    if (finalY > 250) {
       doc.addPage();
       finalY = 20;
    }

    doc.setFont("helvetica", "bold");
    doc.text("ITENS PARA ENTREGA JUNTO COM SERVIÇOS EXECUTADOS", pageWidth / 2, finalY, { align: "center" });

    const deliveryBody = data.deliveryItems.map(item => [
      item.quantity,
      item.description,
      item.color,
      item.supplier,
      item.deliveryOk
    ]);

    if (deliveryBody.length === 0) deliveryBody.push(['', '', '', '', '']);

    autoTable(doc, {
      startY: finalY + 2,
      head: [['Quantidade', 'Descrição', 'Cor', 'Fornecedor', 'Entrega OK']],
      body: deliveryBody,
      theme: 'grid',
      headStyles: { fillColor: [220, 220, 220], textColor: 0, fontStyle: 'bold', lineColor: 0, lineWidth: 0.1 },
      styles: { lineColor: 0, lineWidth: 0.1, textColor: 0 },
      margin: { left: 14, right: 14 }
    });

    // @ts-ignore
    finalY = doc.lastAutoTable.finalY + 15;
  } else {
    finalY += 5;
  }

  if (data.photos && data.photos.length > 0) {
    if (finalY > 260) {
      doc.addPage();
      finalY = 20;
    }

    doc.setFont("helvetica", "bold");
    doc.text("ANEXOS DE FOTOS", pageWidth / 2, finalY, { align: "center" });
    finalY += 10;

    data.photos.forEach((photo, index) => {
      if (finalY > 230) {
        doc.addPage();
        finalY = 20;
      }

      // Tenta inserir a imagem (agora deve funcionar para locais e remotas recuperadas)
      if (photo.dataUrl && photo.dataUrl.length > 100) {
        try {
          const imgProps = doc.getImageProperties(photo.dataUrl);
          const imgWidth = 100;
          const imgHeight = (imgProps.height * imgWidth) / imgProps.width;
          const xPos = (pageWidth - imgWidth) / 2;
          
          doc.addImage(photo.dataUrl, 'JPEG', xPos, finalY, imgWidth, imgHeight);
          
          finalY += imgHeight + 5;
        } catch (e) {
          console.error("Erro ao adicionar foto ao PDF", e);
        }
      } 
      else if (photo.url) {
        // Fallback apenas se a recuperação da imagem falhou
        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        doc.setTextColor(0, 0, 255);
        doc.textWithLink(`[Link: Foto ${index + 1} no Drive]`, pageWidth / 2, finalY, { url: photo.url, align: "center" });
        doc.setTextColor(0);
        finalY += 10;
      }

      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.text(`Foto ${index + 1}: ${photo.caption || 'Sem legenda'}`, pageWidth / 2, finalY, { align: "center" });
      
      finalY += 15;
    });
  }

  doc.save(`${data.requisitionNumber}_${data.clientName}.pdf`);
};