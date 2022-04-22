var deleteRecords = false;
var keepLatest100 = false;
var returnTable = false; //a lot faster w/o, only need with root table ie task
var verbose = true;
var table = 'task';
var maxUpdates = 5000;
var gr = new GlideRecord(table);
gr.addQuery('sys_mod_count', '>=', maxUpdates);
gr.query();
var array = [];
while (gr.next()) {
    array.push(gr.sys_id + '');
}

var arrayAudit = [];
var ga = new GlideAggregate('sys_audit');
ga.addQuery('documentkey', 'IN', array + '');
ga.groupBy('documentkey');
if (returnTable)
    ga.groupBy('tablename');
ga.addAggregate('COUNT', 'documentkey');
if (returnTable)
    ga.addAggregate('COUNT', 'tablename');
ga.orderByAggregate('count', 'documentkey');
ga.query();
gs.info('_ 🕵️ AUDIT COUNTS ______________________');
while (ga.next()) {
    var count = ga.getAggregate('COUNT', 'documentkey');
    if (count > maxUpdates) {
        if (verbose)
            gs.info(ga.tablename + ' [' + ga.documentkey + ']: ' + count);
        arrayAudit.push(ga.documentkey + '');
    }
}

//Only works if they are writing work notes/comments
var arrayJournal = [];
var ga = new GlideAggregate('sys_journal_field');
ga.addQuery('element_id', 'IN', array + '');
ga.groupBy('element_id');
if (returnTable)
    ga.groupBy('name');
ga.addAggregate('COUNT', 'element_id');
if (returnTable)
    ga.addAggregate('COUNT', 'name');
ga.orderByAggregate('count', 'element_id');
ga.query();
gs.info('_ 💬 JOURNAL COUNTS ______________________');
while (ga.next()) {
    var count = ga.getAggregate('COUNT', 'element_id');
    if (count > maxUpdates) {
        if (verbose)
            gs.info(ga.name + ' [' + ga.element_id + ']: ' + count);
        arrayJournal.push(ga.element_id + '');
    }
}

if (keepLatest100 || deleteRecords) {
    for (var i = 0; i < arrayAudit.length; i++) {
        var grAudit = new GlideRecord('sys_audit');
        grAudit.addQuery('documentkey', arrayAudit[i]);
        grAudit.orderBy('sys_created_on');
        if (keepLatest100)
            grAudit.chooseWindow(100, 100000000);
        grAudit.query();
        if (keepLatest100) {
            var x = 0;
            while (grAudit.next()) {
                if (x == 0)
                    gs.info('first: ' + grAudit.sys_created_on)
                    x++;
                if (deleteRecords)
                    grAudit.deleteRecord();
            }
            gs.info('x: ' + x + ' Last: ' + grAudit.sys_created_on);
        }
        if (deleteRecords && !keepLatest100)
            grAudit.deleteMultiple();

        if (deleteRecords) {
            var grSet = new GlideRecord('sys_history_set');
            grSet.addQuery('id', arrayAudit[i]);
            grSet.query();
            grSet.deleteMultiple();
        }
    }
	for (var i = 0; i < arrayJournal.length; i++) {
        var grJournal = new GlideRecord('sys_audit');
        grJournal.addQuery('element_id', arrayJournal[i]);
        grJournal.orderBy('sys_created_on');
        if (keepLatest100)
            grJournal.chooseWindow(100, 100000000);
        grJournal.query();
        if (keepLatest100) {
            var x = 0;
            while (grJournal.next()) {
                if (x == 0)
                    gs.info('first: ' + grJournal.sys_created_on)
                    x++;
                if (deleteRecords)
                    grJournal.deleteRecord();
            }
            gs.info('x: ' + x + ' Last: ' + grJournal.sys_created_on);
        }
        if (deleteRecords && !keepLatest100)
            grJournal.deleteMultiple();

        if (deleteRecords) {
            var grSet = new GlideRecord('sys_history_set');
            grSet.addQuery('id', arrayJournal[i]);
            grSet.query();
            grSet.deleteMultiple();
        }
    }
}
