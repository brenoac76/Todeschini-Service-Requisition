
// --- ATENÇÃO: COPIE ESTE CÓDIGO PARA O APPS SCRIPT ---
// APÓS COPIAR: 
// 1. SALVE O PROJETO
// 2. SELECIONE A FUNÇÃO 'configurarPermissoes' E CLIQUE EM 'EXECUTAR' PARA AUTORIZAR O E-MAIL (Se ainda não fez)
// 3. CLIQUE EM "IMPLANTAR" -> "NOVA IMPLANTAÇÃO"

function configurarPermissoes() {
  var folderName = "Todeschini_Fotos_App";
  var folders = DriveApp.getFoldersByName(folderName);
  var folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(folderName);
  
  var doc = SpreadsheetApp.getActiveSpreadsheet();
  if (!doc.getSheetByName('Requisicoes')) doc.insertSheet('Requisicoes');
  if (!doc.getSheetByName('Usuarios')) {
    var sheetUsers = doc.insertSheet('Usuarios');
    sheetUsers.appendRow(['Username', 'Password', 'Name', 'Role']);
    // Cria o admin padrão se não existir
    sheetUsers.appendRow(['admin', 'Bplu1808#', 'Administrador', 'gestor']);
  }
  
  // Esta linha força o Google a pedir permissão de e-mail quando você roda esta função manualmente
  var emailQuota = MailApp.getRemainingDailyQuota();
  
  return "Permissões OK! Abas criadas. Cota de Email restante: " + emailQuota;
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(45000)) {
    return ContentService.createTextOutput(JSON.stringify({status: 'error', message: 'Servidor ocupado'}))
      .setMimeType(ContentService.MimeType.JSON);
  }

  try {
    var rawData = e.postData.contents;
    var data = JSON.parse(rawData);
    var doc = SpreadsheetApp.getActiveSpreadsheet();

    // --- AUTENTICAÇÃO E USUÁRIOS ---
    if (data.action === 'login') {
      var sheetUsers = doc.getSheetByName('Usuarios');
      if (!sheetUsers) { configurarPermissoes(); sheetUsers = doc.getSheetByName('Usuarios'); }
      
      var rows = sheetUsers.getDataRange().getValues();
      var userFound = null;
      
      // Valida Login
      for (var i = 1; i < rows.length; i++) {
        if (String(rows[i][0]).toLowerCase() === String(data.username).toLowerCase() && String(rows[i][1]) === String(data.password)) {
          userFound = {
            username: rows[i][0],
            name: rows[i][2],
            role: rows[i][3]
          };
          break;
        }
      }
      
      if (userFound) {
        return responseJSON({ status: 'success', user: userFound });
      } else {
        return responseJSON({ status: 'error', message: 'Usuário ou senha inválidos' });
      }
    }

    if (data.action === 'createUser') {
      var sheetUsers = doc.getSheetByName('Usuarios');
      var rows = sheetUsers.getDataRange().getValues();
      
      // Verifica duplicidade
      for (var i = 1; i < rows.length; i++) {
        if (String(rows[i][0]).toLowerCase() === String(data.username).toLowerCase()) {
           return responseJSON({ status: 'error', message: 'Usuário já existe' });
        }
      }
      
      sheetUsers.appendRow([data.username, data.password, data.name, data.role]);
      return responseJSON({ status: 'success' });
    }

    if (data.action === 'updateUser') {
      var sheetUsers = doc.getSheetByName('Usuarios');
      var rows = sheetUsers.getDataRange().getValues();
      var found = false;
      
      for (var i = 1; i < rows.length; i++) {
        if (String(rows[i][0]) === String(data.username)) {
           // Atualiza Nome (col 3 -> index 2) e Role (col 4 -> index 3)
           // Linhas no getRange são base 1, então i+1. Colunas base 1.
           sheetUsers.getRange(i + 1, 3).setValue(data.name);
           sheetUsers.getRange(i + 1, 4).setValue(data.role);
           // Se enviou senha nova (opcional na edição)
           if (data.password) {
              sheetUsers.getRange(i + 1, 2).setValue(data.password);
           }
           found = true;
           break;
        }
      }
      return responseJSON({ status: found ? 'success' : 'error', message: found ? 'Usuário atualizado' : 'Usuário não encontrado' });
    }

    if (data.action === 'deleteUser') {
      var sheetUsers = doc.getSheetByName('Usuarios');
      var rows = sheetUsers.getDataRange().getValues();
      var found = false;
      
      if (data.username === 'admin') {
         return responseJSON({ status: 'error', message: 'Não é possível excluir o admin principal' });
      }

      for (var i = 1; i < rows.length; i++) {
        if (String(rows[i][0]) === String(data.username)) {
           sheetUsers.deleteRow(i + 1);
           found = true;
           break;
        }
      }
      return responseJSON({ status: found ? 'success' : 'error', message: found ? 'Usuário excluído' : 'Usuário não encontrado' });
    }

    if (data.action === 'changePassword') {
      var sheetUsers = doc.getSheetByName('Usuarios');
      var rows = sheetUsers.getDataRange().getValues();
      var updated = false;
      
      for (var i = 1; i < rows.length; i++) {
        if (String(rows[i][0]).toLowerCase() === String(data.username).toLowerCase()) {
          // Se for troca direta (admin resetando) ou validação da senha antiga
          if (data.oldPassword) {
             if (String(rows[i][1]) !== String(data.oldPassword)) {
               return responseJSON({ status: 'error', message: 'Senha atual incorreta' });
             }
          }
          
          sheetUsers.getRange(i + 1, 2).setValue(data.newPassword);
          updated = true;
          break;
        }
      }
      
      return responseJSON({ status: updated ? 'success' : 'error', message: updated ? 'Senha alterada' : 'Usuário não encontrado' });
    }
    
    if (data.action === 'getUsers') {
      var sheetUsers = doc.getSheetByName('Usuarios');
      var rows = sheetUsers.getDataRange().getValues();
      var users = [];
      for (var i = 1; i < rows.length; i++) {
        users.push({ username: rows[i][0], name: rows[i][2], role: rows[i][3] });
      }
      return responseJSON({ status: 'success', users: users });
    }


    // --- IMAGENS (Drive) ---
    if (data.action === 'getImage' && data.fileId) {
      try {
        var file = DriveApp.getFileById(data.fileId);
        var blob = file.getBlob();
        var b64 = Utilities.base64Encode(blob.getBytes());
        return responseJSON({
          status: 'success',
          dataUrl: 'data:' + blob.getContentType() + ';base64,' + b64
        });
      } catch (err) {
        return responseJSON({ status: 'error', message: 'Erro imagem: ' + err.toString() });
      }
    }

    // --- REQUISIÇÕES (Planilha) ---
    var sheet = doc.getSheetByName('Requisicoes');
    
    if (data.action === 'delete' && data.id) {
      var rows = sheet.getDataRange().getValues();
      var deleted = false;
      for (var i = rows.length - 1; i >= 1; i--) {
        if (rows[i][0] == data.id) {
          sheet.deleteRow(i + 1); 
          deleted = true;
          break;
        }
      }
      return responseJSON({ status: deleted ? 'success' : 'not_found' });
    }

    // --- SALVAR REQUISIÇÃO ---
    var driveError = null;
    if (data.photos && data.photos.length > 0) {
      try {
        var folderName = "Todeschini_Fotos_App";
        var folders = DriveApp.getFoldersByName(folderName);
        var folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(folderName);

        for (var i = 0; i < data.photos.length; i++) {
          var photo = data.photos[i];
          if (photo.dataUrl && photo.dataUrl.indexOf('base64,') > -1) {
            var parts = photo.dataUrl.split(',');
            var mimeType = parts[0].split(':')[1].split(';')[0];
            var base64Data = parts[1];
            var fileName = (data.clientName || 'C').replace(/[^a-z0-9]/gi, '_') + "_R" + data.requisitionNumber + "_" + (i+1) + ".jpg";
            
            var blob = Utilities.newBlob(Utilities.base64Decode(base64Data), mimeType, fileName);
            var file = folder.createFile(blob);
            file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
            photo.url = file.getDownloadUrl(); 
            photo.dataUrl = ""; 
          }
        }
      } catch (e) { driveError = e.toString(); }
    }

    var rows = sheet.getDataRange().getValues();
    var rowIndexToUpdate = -1;
    for (var i = 1; i < rows.length; i++) {
       if (rows[i][0] == data.id) { rowIndexToUpdate = i + 1; break; }
    }
    
    // NOVIDADE: Geração de número sequencial atômica no servidor para novas requisições
    if (rowIndexToUpdate === -1) {
       var maxNum = 1000;
       for (var k = 1; k < rows.length; k++) {
         var currentNumStr = String(rows[k][3]).replace(/\D/g, '');
         var val = parseInt(currentNumStr);
         if (!isNaN(val) && val > maxNum) maxNum = val;
       }
       data.requisitionNumber = "R-" + (maxNum + 1);
    }
    
    var rowData = [data.id, data.date, data.clientName, data.requisitionNumber, JSON.stringify(data)];
    
    if (rowIndexToUpdate > 0) sheet.getRange(rowIndexToUpdate, 1, 1, rowData.length).setValues([rowData]);
    else sheet.appendRow(rowData);

    // --- ENVIO DE EMAIL ---
    var emailError = null;
    try {
      var actionText = (rowIndexToUpdate > 0 ? "Atualizada" : "Criada");
      if (data.status === 'Cancelada') actionText = "CANCELADA";

      var subject = "Requisição " + actionText + ": " + data.requisitionNumber + " - " + data.clientName;
      var emailTo = "supervisaomontagemipatinga@gmail.com";
      
      var statusColor = "#333";
      var statusText = data.status || 'Recebido';

      if(data.status === 'Feito') statusColor = "green";
      if(data.status === 'Em Progresso') statusColor = "#d97706"; // amber
      if(data.status === 'Cancelada') {
         statusColor = "#E30613"; // Vermelho Todeschini
         statusText = "CANCELADA";
      }

      var htmlBody = 
        "<div style='font-family: Arial, sans-serif; color: #333; max-width: 600px; border: 1px solid #ddd; padding: 20px; border-radius: 8px;'>" +
          "<h2 style='color: #E30613; margin-top:0;'>Todeschini - Sistema de Requisições</h2>" +
          "<p>Uma requisição foi <strong>" + actionText.toLowerCase() + "</strong> no sistema.</p>" +
          "<hr style='border: 0; border-top: 1px solid #eee; margin: 20px 0;'/>" +
          "<table style='width: 100%; border-collapse: collapse;'>" +
            "<tr><td style='padding: 8px; font-weight: bold;'>Número:</td><td style='padding: 8px;'>" + data.requisitionNumber + "</td></tr>" +
            "<tr><td style='padding: 8px; font-weight: bold;'>Status:</td><td style='padding: 8px; color: " + statusColor + "; font-weight: bold; font-size: 1.1em;'>" + statusText + "</td></tr>" +
            "<tr><td style='padding: 8px; font-weight: bold;'>Cliente:</td><td style='padding: 8px;'>" + data.clientName + "</td></tr>" +
            "<tr><td style='padding: 8px; font-weight: bold;'>Ambiente:</td><td style='padding: 8px;'>" + data.environment + "</td></tr>" +
            "<tr><td style='padding: 8px; font-weight: bold;'>Montador:</td><td style='padding: 8px;'>" + data.fitter + "</td></tr>" +
            "<tr><td style='padding: 8px; font-weight: bold;'>Usuário:</td><td style='padding: 8px;'>" + (data.createdBy || 'Sistema') + "</td></tr>" +
            "<tr><td style='padding: 8px; font-weight: bold;'>Serviços:</td><td style='padding: 8px;'>" + (data.services ? data.services.length : 0) + " item(ns)</td></tr>" +
            "<tr><td style='padding: 8px; font-weight: bold;'>Entregas:</td><td style='padding: 8px;'>" + (data.deliveryItems ? data.deliveryItems.length : 0) + " item(ns)</td></tr>" +
          "</table>" +
          "<br/>" +
          "<p style='font-size: 12px; color: #999;'>Este é um e-mail automático. Não responda.</p>" +
        "</div>";

      MailApp.sendEmail({
        to: emailTo,
        subject: subject,
        htmlBody: htmlBody
      });
    } catch (mailError) {
      // Separa o erro de email do erro de drive
      emailError = mailError.toString();
    }
    // -----------------------

    return responseJSON({ status: 'success', driveError: driveError, emailError: emailError, finalNumber: data.requisitionNumber });

  } catch (error) {
    return responseJSON({ status: 'error', message: error.toString() });
  } finally {
    lock.releaseLock();
  }
}

function doGet(e) {
  var doc = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = doc.getSheetByName('Requisicoes');
  if (!sheet) return responseJSON([]);
  
  var rows = sheet.getDataRange().getValues();
  var result = [];
  for (var i = 1; i < rows.length; i++) {
    try { result.push(JSON.parse(rows[i][4])); } catch (e) {}
  }
  return responseJSON(result.reverse());
}

function responseJSON(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}
