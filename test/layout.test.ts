import { describe, expect, it } from 'vitest'
import { Layout } from '../src/layout'

const mk = (h: number) => ({ height: h, index: -1 })

describe('Layout', () => {
  it('считает смещения и общий размер', () => {
    const L = new Layout()
    L.insert(0, [mk(10), mk(20), mk(30)])
    expect(L.total()).toBe(60)
    expect([0, 1, 2, 3].map(i => L.offset(i))).toEqual([0, 10, 30, 60])
  })

  it('вставка в начало сдвигает индексы', () => {
    const L = new Layout()
    const a = mk(10)
    L.insert(0, [a, mk(20)])
    L.insert(0, [mk(5), mk(5)])
    expect(L.indexOf(a)).toBe(2)
    expect(L.offset(2)).toBe(10)
    expect(L.total()).toBe(40)
  })

  it('ищет элемент по координате', () => {
    const L = new Layout()
    L.insert(0, [mk(10), mk(20), mk(30)])
    expect(L.indexAt(-5)).toBe(0)
    expect(L.indexAt(0)).toBe(0)
    expect(L.indexAt(9.9)).toBe(0)
    expect(L.indexAt(10)).toBe(1)
    expect(L.indexAt(59)).toBe(2)
    expect(L.indexAt(1000)).toBe(2)
  })

  it('смена высоты и удаление пересчитывают хвост', () => {
    const L = new Layout()
    const items = [mk(10), mk(20), mk(30), mk(40)]
    L.insert(0, items)
    L.total()
    L.setHeight(items[1], 25)
    expect(L.offset(4)).toBe(105)
    L.remove(0)
    expect(L.offset(1)).toBe(25)
    expect(L.indexOf(items[3])).toBe(2)
    expect(L.indexOf(items[0])).toBe(-1)
  })

  it('держит сто тысяч элементов и растёт', () => {
    const L = new Layout()
    for (let k = 0; k < 100; k++)
      L.insert(0, Array.from({ length: 1000 }, () => mk(50)))
    expect(L.length).toBe(100_000)
    expect(L.total()).toBe(5_000_000)
    expect(L.indexAt(2_500_000)).toBe(50_000)
  })

  it('считает строки с учётом пропусков', () => {
    const L = new Layout<{ height: number, index: number, count?: number }>()
    const gap = { height: 600, index: -1, count: 10 }
    L.insert(0, [mk(10), gap, mk(20)])
    expect(L.rows()).toBe(12)
    expect([0, 1, 2, 3].map(i => L.rowOf(i))).toEqual([0, 1, 11, 12])
    expect(L.indexAtRow(0)).toBe(0)
    expect(L.indexAtRow(1)).toBe(1)
    expect(L.indexAtRow(10)).toBe(1)
    expect(L.indexAtRow(11)).toBe(2)
  })

  it('заменяет кусок пропуска строками, не меняя счёт', () => {
    const L = new Layout<{ height: number, index: number, count?: number }>()
    const tail = mk(5)
    L.insert(0, [{ height: 1000, index: -1, count: 100 }, tail])
    L.replace(0, 1, [{ height: 400, index: -1, count: 40 }, mk(50), mk(50), { height: 580, index: -1, count: 58 }])
    expect(L.rows()).toBe(101)
    expect(L.indexOf(tail)).toBe(4)
    expect(L.rowOf(4)).toBe(100)
    expect(L.total()).toBe(1085)
    expect(L.indexAtRow(41)).toBe(2)
  })
})
