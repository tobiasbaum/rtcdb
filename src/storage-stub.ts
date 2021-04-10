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

export class StorageStub implements Storage {
    private data = new Map<string, string>();

    clear(): void {
        this.data.clear();
    }

    getItem(key: string): string | null {
        return this.data.get(key) ?? null;
    }

    key(index: number): string | null {
        let keys = Array.from(this.data.keys());
        return keys[index];
    }

    removeItem(key: string): void {
        this.data.delete(key);
    }

    setItem(key: string, value: string): void {
        this.data.set(key, value);
    }
    
    get length(): number {
        return this.data.size;
    }
}
