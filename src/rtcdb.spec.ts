/*
    Copyright 2021 Tobias Baum.
    
    This file is part of RTCDB.

    RTCDB is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    Foobar is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with RTCDB.  If not, see <http://www.gnu.org/licenses/>.
*/

import { RTCDB } from "./rtcdb";
import { StorageStub } from './storage-stub';

export class StubNetwork {
    peers = new Map<string, StubPeer>();
    msg: any[] = [];
    handlers = new Map<string, StubConnection>();

    exchangeMessages() {
        let cnt = 0;
        while (this.msg.length > 0) {
            let m = this.msg.shift();
            m();
            cnt++;
        }
        console.log('exchanged ' + cnt + ' messages');
    }

    getOrCreateConnection(from: StubPeer, to: string) {
        let key = from.user + '->' + to;
        if (this.handlers.has(key)) {
            return this.handlers.get(key);
        }
        let c = new StubConnection(from, to);
        this.handlers.set(key, c);
        this.peers.get(to)?.connect(from.user, {});
        return c;
    }

}

export class StubPeer {

    onConnection: any[] = [];

    constructor(public user: string, public network: StubNetwork) {
        network.peers.set(user, this);
    }

    connect(id: string, options: any) {
        this.network.msg.push(() => {this.network.handlers.get(this.user + '->' + id)?.onOpen.forEach(x => x())});
        let conn = this.network.getOrCreateConnection(this, id);
        this.network.msg.push(() => {this.onConnection.forEach(x => x(conn))});
        return conn;
    }

    on(t: string, f: any) {
        if (t === 'connection') {
            this.onConnection.push(f);
        }
    }
}

export class StubConnection {
    onOpen: any[] = [];
    onData: any[] = [];

    constructor(public myself: StubPeer, public peer: string) {
    }

    on(t: string, f: any) {
        if (t === 'open') {
            this.onOpen.push(f);
        }
        if (t === 'data') {
            this.onData.push(f);
        }
    }

    send(data: any) {
        let nw = this.myself.network;
        nw.msg.push(() => {nw.handlers.get(this.peer + '->' + this.myself.user)?.onData.forEach(x => x(JSON.parse(JSON.stringify(data))))});
    }
}

describe('RTCDB', () => {

    let stubNetwork: StubNetwork;

    beforeEach(() => {
        stubNetwork = new StubNetwork();
    });
  
    function createDBS(user: string): RTCDB {
        let p = new StubPeer(user, stubNetwork);
        let dds = new RTCDB('dbs', p, user, new StorageStub(), true);
        return dds;
    }
    
    it('should create', () => {
        let dbs = createDBS('user1');
        expect(dbs).toBeTruthy();
    });

    it('allows put and get', () => {
        let dbs = createDBS('user1');
        dbs.put('testdb', 'x', ['a', 'b']);
        expect(dbs.get('testdb', 'x')).toEqual(['a', 'b']);
        expect(dbs.get('testdb', 'y')).toBeUndefined();
    });

    it('notifies multiple listeners', () => {
        let dbs = createDBS('user1');
        let log = '';
        dbs.on('add', 'db', false, (id: string, dta: any) => log += 'add ' + id + ',' + JSON.stringify(dta) + '\n');
        dbs.on('update', 'db', false, (id: string, dta: any) => log += 'update ' + id + ',' + JSON.stringify(dta) + '\n');
        dbs.on(['add', 'update'], 'db', false, (id: string, dta: any) => log += 'au ' + id + ',' + JSON.stringify(dta) + '\n');
        dbs.put('db', 'x', 1);
        dbs.put('db', 'x', 2);
        dbs.put('db', 'x', 3);
        stubNetwork.exchangeMessages();
        expect(dbs.get('db', 'x')).toEqual(3);

        expect(log).toEqual(
            'add x,1\n' +
            'au x,1\n' +
            'update x,2\n' +
            'au x,2\n' +
            'update x,3\n' +
            'au x,3\n');
    });

    it('keeps two peers in sync', () => {
        let dbs1 = createDBS('user1');
        let dbs2 = createDBS('user2');
        dbs1.connectToNode('user2');
        dbs1.put('testdb', 'x', ['a', 'b', 'c']);
        stubNetwork.exchangeMessages();
        expect(dbs1.get('testdb', 'x')).toEqual(['a', 'b', 'c']);
        expect(dbs2.get('testdb', 'x')).toEqual(['a', 'b', 'c']);
        dbs2.put('testdb', 'y', ['V', 'W']);
        stubNetwork.exchangeMessages();
        expect(dbs1.get('testdb', 'x')).toEqual(['a', 'b', 'c']);
        expect(dbs2.get('testdb', 'x')).toEqual(['a', 'b', 'c']);
        expect(dbs1.get('testdb', 'y')).toEqual(['V', 'W']);
        expect(dbs2.get('testdb', 'y')).toEqual(['V', 'W']);
    });

    it('keeps three peers in sync', () => {
        let dbs1 = createDBS('user1');
        let log1 = '';
        dbs1.on('add', 'testdb', false, (id: string, dta: any) => log1 += 'add ' + id + ',' + JSON.stringify(dta) + '\n');
        dbs1.on('update', 'testdb', false, (id: string, dta: any) => log1 += 'update ' + id + ',' + JSON.stringify(dta) + '\n');
        stubNetwork.exchangeMessages();
        let dbs2 = createDBS('user2');
        let log2 = '';
        dbs2.on(['add', 'update'], 'testdb', false, (id: string, dta: any) => log2 += 'add/update ' + id + ',' + JSON.stringify(dta) + '\n');
        dbs2.connectToNode('user1');
        stubNetwork.exchangeMessages();
        let dbs3 = createDBS('user3');
        let log3 = '';
        dbs3.on(['add', 'update'], 'testdb', false, (id: string, dta: any) => log3 += 'add/update ' + id + ',' + JSON.stringify(dta) + '\n');
        dbs3.connectToNode('user1');
        stubNetwork.exchangeMessages();
        dbs1.put('testdb', 'x', ['a', 'b', 'c']);
        stubNetwork.exchangeMessages();
        expect(dbs1.get('testdb', 'x')).toEqual(['a', 'b', 'c']);
        expect(dbs2.get('testdb', 'x')).toEqual(['a', 'b', 'c']);
        expect(dbs3.get('testdb', 'x')).toEqual(['a', 'b', 'c']);
        dbs2.put('testdb', 'y', ['V', 'W']);
        stubNetwork.exchangeMessages();
        expect(dbs1.get('testdb', 'y')).toEqual(['V', 'W']);
        expect(dbs2.get('testdb', 'y')).toEqual(['V', 'W']);
        expect(dbs3.get('testdb', 'y')).toEqual(['V', 'W']);
        dbs3.put('testdb', 'z', []);
        stubNetwork.exchangeMessages();
        expect(dbs1.get('testdb', 'z')).toEqual([]);
        expect(dbs2.get('testdb', 'z')).toEqual([]);
        expect(dbs3.get('testdb', 'z')).toEqual([]);
        dbs1.put('testdb', 'x', ['a', 'b', 'c', 'd']);
        stubNetwork.exchangeMessages();
        expect(dbs1.get('testdb', 'x')).toEqual(['a', 'b', 'c', 'd']);
        expect(dbs2.get('testdb', 'x')).toEqual(['a', 'b', 'c', 'd']);
        expect(dbs3.get('testdb', 'x')).toEqual(['a', 'b', 'c', 'd']);
        dbs2.put('testdb', 'y', ['Q', 'V', 'W']);
        stubNetwork.exchangeMessages();
        expect(dbs1.get('testdb', 'y')).toEqual(['Q', 'V', 'W']);
        expect(dbs2.get('testdb', 'y')).toEqual(['Q', 'V', 'W']);
        expect(dbs3.get('testdb', 'y')).toEqual(['Q', 'V', 'W']);
        dbs3.put('testdb', 'z', ['1']);
        stubNetwork.exchangeMessages();
        expect(dbs1.get('testdb', 'z')).toEqual(['1']);
        expect(dbs2.get('testdb', 'z')).toEqual(['1']);
        expect(dbs3.get('testdb', 'z')).toEqual(['1']);

        expect(log1).toEqual(
            'add x,["a","b","c"]\n' +
            'add y,["V","W"]\n' +
            'add z,[]\n' +
            'update x,["a","b","c","d"]\n' +
            'update y,["Q","V","W"]\n' +
            'update z,["1"]\n');

        expect(log2).toEqual(
            'add/update x,["a","b","c"]\n' +
            'add/update y,["V","W"]\n' +
            'add/update z,[]\n' +
            'add/update x,["a","b","c","d"]\n' +
            'add/update y,["Q","V","W"]\n' +
            'add/update z,["1"]\n');

        expect(log3).toEqual(
            'add/update x,["a","b","c"]\n' +
            'add/update y,["V","W"]\n' +
            'add/update z,[]\n' +
            'add/update x,["a","b","c","d"]\n' +
            'add/update y,["Q","V","W"]\n' +
            'add/update z,["1"]\n');
    });

    it('keeps three peers in sync with different topology', () => {
        let dbs1 = createDBS('user1');
        let log1 = '';
        dbs1.on('add', 'testdb', false, (id: string, dta: any) => log1 += 'add ' + id + ',' + JSON.stringify(dta) + '\n');
        dbs1.on('update', 'testdb', false, (id: string, dta: any) => log1 += 'update ' + id + ',' + JSON.stringify(dta) + '\n');
        stubNetwork.exchangeMessages();
        let dbs2 = createDBS('user2');
        let log2 = '';
        dbs2.on(['add', 'update'], 'testdb', false, (id: string, dta: any) => log2 += 'add/update ' + id + ',' + JSON.stringify(dta) + '\n');
        dbs2.connectToNode('user1');
        stubNetwork.exchangeMessages();
        let dbs3 = createDBS('user3');
        let log3 = '';
        dbs3.on(['add', 'update'], 'testdb', false, (id: string, dta: any) => log3 += 'add/update ' + id + ',' + JSON.stringify(dta) + '\n');
        dbs3.connectToNode('user2');
        stubNetwork.exchangeMessages();
        dbs1.put('testdb', 'x', ['a', 'b', 'c']);
        stubNetwork.exchangeMessages();
        expect(dbs1.get('testdb', 'x')).toEqual(['a', 'b', 'c']);
        expect(dbs2.get('testdb', 'x')).toEqual(['a', 'b', 'c']);
        expect(dbs3.get('testdb', 'x')).toEqual(['a', 'b', 'c']);
        dbs1.put('testdb', 'x', ['a', 'b', 'c', 'd']);
        stubNetwork.exchangeMessages();
        expect(dbs1.get('testdb', 'x')).toEqual(['a', 'b', 'c', 'd']);
        expect(dbs2.get('testdb', 'x')).toEqual(['a', 'b', 'c', 'd']);
        expect(dbs3.get('testdb', 'x')).toEqual(['a', 'b', 'c', 'd']);
        dbs2.put('testdb', 'y', ['V', 'W']);
        stubNetwork.exchangeMessages();
        expect(dbs1.get('testdb', 'y')).toEqual(['V', 'W']);
        expect(dbs2.get('testdb', 'y')).toEqual(['V', 'W']);
        expect(dbs3.get('testdb', 'y')).toEqual(['V', 'W']);
        dbs2.put('testdb', 'y', ['Q', 'V', 'W']);
        stubNetwork.exchangeMessages();
        expect(dbs1.get('testdb', 'y')).toEqual(['Q', 'V', 'W']);
        expect(dbs2.get('testdb', 'y')).toEqual(['Q', 'V', 'W']);
        expect(dbs3.get('testdb', 'y')).toEqual(['Q', 'V', 'W']);
        dbs3.put('testdb', 'z', []);
        stubNetwork.exchangeMessages();
        expect(dbs1.get('testdb', 'z')).toEqual([]);
        expect(dbs2.get('testdb', 'z')).toEqual([]);
        expect(dbs3.get('testdb', 'z')).toEqual([]);
        dbs3.put('testdb', 'z', ['1']);
        stubNetwork.exchangeMessages();
        expect(dbs1.get('testdb', 'z')).toEqual(['1']);
        expect(dbs2.get('testdb', 'z')).toEqual(['1']);
        expect(dbs3.get('testdb', 'z')).toEqual(['1']);

        expect(log1).toEqual(
            'add x,["a","b","c"]\n' +
            'update x,["a","b","c","d"]\n' +
            'add y,["V","W"]\n' +
            'update y,["Q","V","W"]\n' +
            'add z,[]\n' +
            'update z,["1"]\n');

        expect(log2).toEqual(
            'add/update x,["a","b","c"]\n' +
            'add/update x,["a","b","c","d"]\n' +
            'add/update y,["V","W"]\n' +
            'add/update y,["Q","V","W"]\n' +
            'add/update z,[]\n' +
            'add/update z,["1"]\n');

        expect(log3).toEqual(
            'add/update x,["a","b","c"]\n' +
            'add/update x,["a","b","c","d"]\n' +
            'add/update y,["V","W"]\n' +
            'add/update y,["Q","V","W"]\n' +
            'add/update z,[]\n' +
            'add/update z,["1"]\n');
    });

});
