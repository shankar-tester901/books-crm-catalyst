const express = require('express');
const app = express();
const catalyst = require('zcatalyst-sdk-node');
const bodyParser = require('body-parser');
const axios = require('axios');

//Scope used : - ZohoBooks.contacts.CREATE,ZohoBooks.contacts.READ,ZohoBooks.contacts.UPDATE,ZohoBooks.purchaseorders.CREATE,ZohoBooks.purchaseorders.UPDATE,ZohoBooks.purchaseorders.READ
let list_of_vendor_emails = [];
//let sendToClient = [];
app.use(bodyParser.json()); // support json encoded bodies
app.use(bodyParser.urlencoded({ extended: true })); // support encoded bodies


const CREDENTIALS = {
    BooksConnector: {
        client_id: '1000.ZOMX594O4VL9JN',
        client_secret: 'fda9e56a563e11ab69',
        auth_url: 'https://accounts.zoho.com/oauth/v2/auth',
        refresh_url: 'https://accounts.zoho.com/oauth/v2/token',
        refresh_token: '1000.84478140e09f6f6f25'
    }
};



/**
 * This is the function which gets invoked from Books via webhooks
 * Each time a Purchase Order gets created in Books, this gets invoked and
 * all the PO attributes are received here
 * 
 */

app.post('/receiveBooksInfo', async function(req, res) {
    console.log('---------------Books info received -----------------');

    const catalystApp = catalyst.initialize(req);
    const accessToken = await catalystApp.connection(CREDENTIALS).getConnector('BooksConnector').getAccessToken();


    let r_object = req.body.JSONString;
    let obj = JSON.parse(r_object);
    let line_item_rate = [];
    let line_item_qty = [];
    let line_item_total = [];
    let line_item_unit = [];
    let line_item_name = [];
    let line_item_id = [];
    let item_id = [];

    let vendorid = obj.purchaseorder.vendor_id;
    let poid = obj.purchaseorder.purchaseorder_id;
    let ponumber = obj.purchaseorder.purchaseorder_number;

    //This is the most important data to be captured as one needs to deal
    //with the multiple line items sent across
    let items = obj.purchaseorder.line_items;

    console.log(items);

    //store the line items in the array for each PO

    for (i = 0; i < items.length; i++) {
        line_item_rate.push(items[i].rate);
        line_item_qty.push(items[i].quantity);
        line_item_name.push(items[i].name);
        line_item_total.push(items[i].item_total);
        line_item_unit.push(items[i].unit);
        line_item_id.push(items[i].line_item_id);
        item_id.push(items[i].item_id);
    }

    // for (i = 0; i < items.length; i++) {
    //     console.log('item DETAILS ARE ------------- id ' + item_id[i] + '   rate  ' + line_item_rate[i] + '   quantity  ' + line_item_qty[i] + '  name  ' + line_item_name[i] + '   total  ' + line_item_total[i] + '  unit ' + line_item_unit[i]);
    // }


    list_of_vendor_emails = await getListOfVendorEmails(accessToken, obj.purchaseorder.vendor_id, obj.purchaseorder.purchaseorder_id, ponumber);
    // console.log(list_of_vendor_emails);






    if (list_of_vendor_emails.length == 0) {
        console.log('Unable to get details of Vendors ');
        res.send('Unable to get details of Vendors');
    } else {
        dataToSend = true;
        await storePODetails(catalystApp, vendorid, poid, ponumber, line_item_name, line_item_rate, line_item_qty, line_item_unit, line_item_total, list_of_vendor_emails, line_item_id, item_id);
        res.send(list_of_vendor_emails);
    }



});

/**
 * Function to store the PO details in the Catalyst database in the PODetails table
 *  @param {* id of the vendor } vendorid 
 * @param {* id of the purchase order } poid - 
 * @param {* po number of the purchase order } ponumber - 
 * @param {* array containing line item names like Cow Milk, Buffalo Milk } name - 
 * @param {* array containing the rate at which the line item is offered } rate - 
 * @param {* array containing the  quantity of line item  } qty - 
 * @param {* array containing the  measurement unit like kgs, lbs, kms for the line item } unit - 
 * @param {* array containing the total price for the line item } total - 
 * @param {* array containing emails of the vendors } list_of_vendor_emails - 
 * @param {*  array containing the id of the line item } lineitemid -
 * @param {* array containing the id of the item like Cow Milk, Buffalo Milk } itemid - 
 */


const storePODetails = async(catalystApp, vendorid, poid, ponumber, name, rate, qty, unit, total, list_of_vendor_emails, lineitemid, itemid) => {
    console.log('in store po details ');
    console.log(qty);
    console.log(unit);
    let datastore = catalystApp.datastore();
    let table = datastore.table('PODetails');

    for (i = 0; i < list_of_vendor_emails.length; i++) {

        for (x = 0; x < name.length; x++) {

            // Each vendor will have as many rows as the no. of line items given in the PO
            //So, if a PO has 3 line items , then each vendor will have 3 line items listed for his email
            //So if there are 5 vendors, then we will have 15 rows in the PODetails table

            //        console.log('-----------------------            ' + i + ' email  ' + list_of_vendor_emails[i].email + ' contact id ' + list_of_vendor_emails[i].contact_id + '  name   ' + name[x] + ' item id' + itemid[x]);
            let rowData = {

                email: list_of_vendor_emails[i].email,
                contact_id: list_of_vendor_emails[i].contact_id,
                name: name[x],
                rate: rate[x],
                total: total[x],
                lineitem: lineitemid[x],
                itemid: itemid[x],
                qty: qty[x],
                unit: unit[x],
                vendor_id: vendorid,
                poid: poid,
                ponumber: ponumber
            };

            let insertPromise = table.insertRow(rowData);
            insertPromise.then((row) => {
                console.log('row inserted');
            });
        }
    }

}




/**Gets all the emails of vendors in the system
 * 
 * @param {* The access token } accessToken 
 * @returns list of vendor-emails
 */

const getListOfVendorEmails = async(accessToken, vendorid, poid, ponumber) => {
    var myData = [];

    try {

        if (accessToken == null) {
            console.log('accesstoken is null');
        }
        let config = {
            method: 'get',
            url: 'https://books.zoho.com/api/v3/contacts?filter_by=Status.Vendors',
            headers: {
                'Authorization': 'Zoho-oauthtoken ' + accessToken,
                'Content-Type': 'application/json',
            }
        };

        const response = await axios(config);
        if (response.status == 200) {
            var listContacts = response.data.contacts;
            for (i = 0; i < listContacts.length; i++) {
                let vendorData = {
                    email: listContacts[i].email,
                    contact_id: listContacts[i].contact_id,
                    vendor_id: vendorid,
                    poid: poid,
                    ponumber: ponumber
                };

                myData.push(vendorData);
            }
        }
        return myData;

    } catch (e) {
        console.log(e);
        console.log("Failure. Unable to get the emails of vendors.  " + e.statusText);
        myData = [];
        return myData;

    }
}


/**
 *  This gets called from the client side. When the Winner button is clicked, this function gets called
 * 
 * 
 */

app.post('/updatePO', async function(req, res) {
    const catalystApp = catalyst.initialize(req);
    const accessToken = await catalystApp.connection(CREDENTIALS).getConnector('BooksConnector').getAccessToken();
    let vendorid = req.body.vendorid;
    let poid = req.body.poid;
    let rowid = req.body.rowid; //this will be an array


    //This is what is contained in lineitems as an array
    // let lineItemEntries = {
    //     'line_item_id': row.cells[3].innerHTML,
    //     'rate': rateDetail,
    //     'item_id': row.cells[5].innerHTML,
    //     'name': row.cells[0].innerHTML
    // }


    let lineDetails = req.body.lineitems;
    //      This is what is stored in linedetailsNames -  name_of_line_itemsArray.push(row.cells[0].innerHTML); //Cow Milk, Buffalo Milk ...

    let lineDetailsNames = req.body.linedetailsNames;
    let winnerEmail = req.body.winnerEmail;

    console.log(lineDetailsNames);


    //we need to check if there has already been some processing done for the PO line items.
    //If so, we need to create a new PO else we can update the existing PO
    let poStatus = await checkPOStatus(catalystApp, poid);

    if (poStatus) {
        console.log('in create PO ------------------------------------- ');
        let poCreationResult = await createPO(catalystApp, accessToken, vendorid, poid, rowid, lineDetails, lineDetailsNames, winnerEmail);
        if (poCreationResult) {
            // res.send('PO created via auction');
            res.redirect(301, '/server/bookscatalystconnection_function/getDetails');
            // res.redirect('back');
        } else {
            res.send('Unable to create PO via auction');
        }
    } else {
        console.log('in update PO ------------------------------------- ');
        await updatePO(catalystApp, accessToken, vendorid, poid, rowid, lineDetails, lineDetailsNames, winnerEmail);
        //res.send('Vendor id updated in PO via auction');
        res.redirect(301, '/server/bookscatalystconnection_function/getDetails');
        // res.redirect('back');
    }



})

/**
 * 
 * @param {* Handle to Catalyst} catalystApp 
 * @param {* poid of the specific Purchase Order to be updated} poid 
 * @returns true if there is any lineItemWinner value as true for the poid across vendors
 *  It will mean that the Purchase Order has been processed sometime earlier. All subsequent processings
 * for the particular poid must create new POs
 */
const checkPOStatus = async(catalystApp, poid) => {

    console.log('in check PO Status ');
    let zcql = catalystApp.zcql();
    var query = "select lineItemWinner from PODetails where poid= " + poid;
    console.log(query);
    let responses = [];
    let queryResult = await zcql.executeZCQLQuery(query);
    for (i = 0; i < queryResult.length; i++) {
        responses.push(queryResult[i].PODetails.lineItemWinner);
    }
    var checkResponse = responses.includes(true);
    return checkResponse;

}


/**
 * 
 * @param {* The access token } accessToken 
 *  @param {* The purchase order id to be updated } purchase_order_id 
 *  @param {* The email which won the auction } chosen_email 
 *   @param {* The vendor id } vendor_id
 * @returns {* result of the operation } true/false
 */

const createPO = async(catalystApp, accessToken, vendor_id, purchase_order_id, rowid, lineDetails, names, winnerEmail) => {

    console.log('CREATE PO  vendorid ' + vendor_id + '    poid ' + purchase_order_id);

    // This is the array that lineDetails contains
    // let lineItemEntries = {
    //     'line_item_id': row.cells[3].innerHTML,
    //     'rate': rateDetail,
    //     'item_id': row.cells[5].innerHTML,
    //     'name': row.cells[0].innerHTML
    // }
    let details = lineDetails;

    var itemDetails = [];

    for (m = 0; m < details.length; m++) {
        //We do not need line_item_id while Creating a new PO hence constructing a new JSON object
        var itemEntries = {
            'item_id': details[m].item_id,
            'rate': details[m].rate,
            'name': details[m].name
        }
        itemDetails.push(itemEntries);
    }

    console.log(itemDetails);

    try {

        if (accessToken == null) {
            console.log('accesstoken is null');
        }
        let config = {
            method: 'post',
            url: 'https://books.zoho.com/api/v3/purchaseorders/',
            data: {
                'vendor_id': vendor_id,
                'contact_persons': [],
                'line_items': itemDetails,

            },
            headers: {
                'Authorization': 'Zoho-oauthtoken ' + accessToken,
                'Content-Type': 'application/json',
                'X-ZOHO-Skip-Webhook-Trigger': 'true'
            }
        };
        //  console.log(JSON.stringify(config));

        const response = await axios(config);
        await updateLineItemWinner_POTable(catalystApp, purchase_order_id, winnerEmail);
        await updatePODetailsTable(catalystApp, purchase_order_id, names);

        return true;

    } catch (e) {
        console.log(e);
        console.log("Failure in creating PO " + e.statusText);

        return false;
    }
}





/**
 * 
 * @param {* The access token } accessToken 
 *  @param {* The purchase order id to be updated } purchase_order_id 
 *  @param {* The email which won the auction } chosen_email 
 *   @param {* The vendor id } vendor_id
 * @returns {* result of the operation } true/false
 */

const updatePO = async(catalystApp, accessToken, vendor_id, purchase_order_id, rowid, lineDetails, names, winnerEmail) => {

    console.log('in updatePO  vendorid ' + vendor_id + '    poid ' + purchase_order_id);
    console.log(lineDetails);
    // let itemDetails = [];

    // for (m = 0; m < lineDetails.length; m++) {

    //     var itemEntries = {
    //         'rate': lineDetails[m].rate,
    //         'line_item_id': lineDetails[m].line_item_id
    //     }
    //     itemDetails.push(itemEntries);
    // }

    // console.log(itemDetails);


    try {

        if (accessToken == null) {
            console.log('accesstoken is null');
        }
        let config = {
            method: 'put',
            url: 'https://books.zoho.com/api/v3/purchaseorders/' + purchase_order_id,
            data: {
                'vendor_id': vendor_id,
                'contact_persons': [],
                'line_items': lineDetails
            },
            headers: {
                'Authorization': 'Zoho-oauthtoken ' + accessToken,
                'Content-Type': 'application/json',
            }
        };

        const response = await axios(config);
        await updateLineItemWinner_POTable(catalystApp, purchase_order_id, winnerEmail);
        await updatePODetailsTable(catalystApp, purchase_order_id, names);

        console.log(" updated in Books PO post auction  ");

        return true;

    } catch (e) {
        console.log(e);
        console.log("Failure here " + e.statusText);
        return false;
    }
}



/**
 * This is called to update the line items names like Cow Milk etc as that has already been addressed by
 * some vendor. So the entries for that specific line item will not be part of the subsequent auctions
 * @param {* handle to Catalyst } catalystApp 
 * @param {* purchase order id} poid 
 * @param {* array containing names of the line items like Cow Milk, Buffalo Milk etc} names 
 * @returns true
 */

const updatePODetailsTable = async(catalystApp, poid, names) => {
    console.log('in updatePODetailsTable ');


    for (t = 0; t < names.length; t++) {
        // console.log('t is ---  ' + t);
        let zcql = catalystApp.zcql();
        var query = "select * from PODetails where poid= " + poid + " and name='" + names[t] + "' and lineItemWinner=false ";
        console.log(query);
        let rowids = [];
        let queryResult = await zcql.executeZCQLQuery(query);
        for (i = 0; i < queryResult.length; i++) {
            rowids.push(queryResult[i].PODetails.ROWID);
        }

        for (j = 0; j < rowids.length; j++) {
            let updateRowData = {
                lineItemWinner: true,
                ROWID: rowids[j]
            };


            let datastore = catalystApp.datastore();
            let table = datastore.table('PODetails');
            let rowPromise = table.updateRow(updateRowData);
            rowPromise.then((row) => {
                console.log('updated non-Winner rows');
            });
        }


    }

    console.log('all rows updated for rest of the non-winners************************* ');
    return true;
}



/**
 *  Update all the rows of the winner vendor with lineItemWinner as true so that 
 * it does not participate in any other Auction again for that specific PO
 * @param {* handle to Catalyst} catalystApp 
 * @param {* poid of the purchase order to be updated } poid 
 * @param {* email address of the vendor who has won the deal for the line item} winnerEmail 
 * @returns true/false
 */


const updateLineItemWinner_POTable = async(catalystApp, poid, winnerEmail) => {


    console.log('in closeWinnerEmailPO ');

    //get all the rows pertaining to the poid for the winner and then update each row one by one
    let zcql = catalystApp.zcql();
    var query = "select * from PODetails where poid= " + poid + " and email='" + winnerEmail + "'"; // from PODetails where lineItemWinner=false";
    console.log(query);
    let rowids = [];
    let queryResult = await zcql.executeZCQLQuery(query);
    //  console.log(queryResult);
    for (i = 0; i < queryResult.length; i++) {
        rowids.push(queryResult[i].PODetails.ROWID);
    }
    console.log(rowids);

    for (j = 0; j < rowids.length; j++) {
        let updateRowData = {
            lineItemWinner: true,
            ROWID: rowids[j]
        };

        //Use Table Meta Object to update a single row using ROWID which returns a promise
        let datastore = catalystApp.datastore();
        let table = datastore.table('PODetails');
        let rowPromise = table.updateRow(updateRowData);
        rowPromise.then((row) => {
            console.log('row updated with lineItemWinner as true for the WinnerEmail');
        });

    }

    console.log('Winner PO Updated +++++++++++++++ ');
    return true;
}


/**
 * This is invoked from the client to construct the client UI
 */
app.get('/getDetails', async(req, res) => {
    console.log('******** get details invoked ********** ');
    const catalystApp = catalyst.initialize(req);
    let sendToClient = await getInfoFromDB(catalystApp);
    console.log(sendToClient);
    res.send(sendToClient);
})

/**Queries the database and sends the POs including the lineitems to the client
 * 
 * @param {*} catalystApp 
 * @returns 
 */

const getInfoFromDB = async(catalystApp) => {

    let zcql2 = catalystApp.zcql();

    let ponumberArray = [];
    let sendInfo = [];

    let zcql = catalystApp.zcql();
    var query = "select distinct ponumber from PODetails";
    let queryResult = await zcql.executeZCQLQuery(query);

    for (i = 0; i < queryResult.length; i++) {
        ponumberArray.push(queryResult[i].PODetails.ponumber);
    }


    for (j = 0; j < ponumberArray.length; j++) {


        let emailArray = [];
        let contactidArray = [];
        let query2 = "select distinct email from PODetails where ponumber='" + ponumberArray[j] + "'";
        console.log(query2);
        let queryResult2 = await zcql2.executeZCQLQuery(query2);
        for (k = 0; k < queryResult2.length; k++) {
            emailArray.push(queryResult2[k].PODetails.email);
        }

        for (jj = 0; jj < emailArray.length; jj++) {
            let query_contact = "select distinct contact_id from PODetails where ponumber='" + ponumberArray[j] + "' and email='" + emailArray[jj] + "'";
            console.log(query_contact);
            let queryResult22 = await zcql2.executeZCQLQuery(query_contact);
            contactidArray.push(queryResult22[0].PODetails.contact_id);
        }

        //get the vendor details for the PO
        for (a = 0; a < emailArray.length; a++) {

            let lineItemsList = [];

            let query4 = "select itemid, vendor_id, poid, lineitem, rate, total, name, rowid from PODetails where ponumber='" + ponumberArray[j] + "' and email='" + emailArray[a] + "'  and lineItemWinner=false";
            console.log(query4);
            queryResult4 = await zcql2.executeZCQLQuery(query4);

            let total = [];
            let rate = [];
            let lineitem = [];
            let rowid = [];
            let name = [];
            let itemid = [];

            if (queryResult4.length == 0) continue;
            for (n = 0; n < queryResult4.length; n++) {
                total.push(queryResult4[n].PODetails.total);
                rate.push(queryResult4[n].PODetails.rate);
                lineitem.push(queryResult4[n].PODetails.lineitem);
                rowid.push(queryResult4[n].PODetails.ROWID);
                name.push(queryResult4[n].PODetails.name);
                itemid.push(queryResult4[n].PODetails.itemid);
            }

            lineItemsForPOAndEmail = {
                'name': name,
                'rate': rate,
                'lineitem': lineitem,
                'rowid': rowid,
                'total': total,
                'itemid': itemid
            }

            lineItemsList.push(lineItemsForPOAndEmail);

            let rowData = {

                ponumber: ponumberArray[j],
                vendorid: queryResult4[0].PODetails.vendor_id,
                poid: queryResult4[0].PODetails.poid,
                contactsemail: emailArray[a],
                contactsid: contactidArray[a],
                lineitems: lineItemsList

            }

            sendInfo.push(rowData);
        }

    }
    return sendInfo;

}


app.post('/sendEmailsToVendors', async function(req, res) {
    const catalystApp = catalyst.initialize(req);
    let vendorEmails = req.body.vendorEmails;
    let ponumber = req.body.ponumber;
    console.log(vendorEmails);
    console.log(ponumber);
    sendEmail_with_Data(catalystApp, vendorEmails, ponumber);
    res.send('Mail sent to vendors');
})


const sendEmail_with_Data = async(catalystApp, emailArray, ponumber) => {
    try {
        console.log('in send email ...........');
        let zcql = catalystApp.zcql();
        let query = "select qty, name, unit from PODetails where ponumber='" + ponumber + "' and email='" + emailArray[0] + "'";
        console.log(query);
        queryResult4now = await zcql.executeZCQLQuery(query);

        var content = '';
        for (i = 0; i < queryResult4now.length; i++) {
            content = content + " - " + queryResult4now[i].PODetails.qty + " " + queryResult4now[i].PODetails.unit + " of " + queryResult4now[i].PODetails.name + " \n ";
        }
        for (i = 0; i < emailArray.length; i++) {
            let config = {
                from_email: 'shankarr+1003@zohocorp.com',
                to_email: emailArray[i],
                subject: 'Request for competitive price for items',
                content: "We want to purchase the following and want the best quote from you  \n \n " + content
            };


            let email = catalystApp.email();
            let mailPromise = email.sendMail(config);
            mailPromise.then((mailObject) => {
                console.log('mailed to vendors ');
            });

        }
        return true;
    } catch (e) {
        console.log(e);
        return false;
    }
}


module.exports = app;
