package codes.quine.labo.redos
package automaton

import scala.util.Success
import scala.util.Try

import Complexity._
import data.IChar
import regexp.Compiler
import regexp.Parser
import util.Timeout

class CheckerSuite extends munit.FunSuite {

  /** Timeout checking is disabled in testing. */
  implicit val timeout: Timeout.NoTimeout.type = Timeout.NoTimeout

  /** Runs a checker against the RegExp. */
  def check(source: String, flags: String): Try[Complexity[IChar]] =
    for {
      pattern <- Parser.parse(source, flags)
      epsNFA <- Compiler.compile(pattern)
      nfa = epsNFA.toOrderedNFA.rename
      result <- Checker.check(nfa)
    } yield result

  test("Checker.check: constant") {
    assertEquals(check("^foo$", ""), Success(Constant))
    assertEquals(check("^((fi|bu)z{2}){1,2}$", ""), Success(Constant))
  }

  test("Checker.check: linear") {
    assertEquals(check("a*", ""), Success(Linear))
    assertEquals(check("(a*)*", ""), Success(Linear))
    assertEquals(check("^([a:]|\\b)*$", ""), Success(Linear))
  }

  test("Checker.check: polynomial") {
    val a = IChar('a')
    val other = IChar('a').complement(false)
    assertEquals(
      check("^.*a.*a$", "s"),
      Success(Polynomial(2, Witness(Seq((Seq(a), Seq(a))), Seq(other))))
    )
    assertEquals(
      check("^(.a)*a(.a)*a$", "s"),
      Success(Polynomial(2, Witness(Seq((Seq(other, a), Seq(a, a))), Seq(a, a, a))))
    )
    assertEquals(
      check("^.*a.*a.*a$", "s"),
      Success(Polynomial(3, Witness(Seq((Seq(other), Seq(a)), (Seq.empty, Seq(a))), Seq(other))))
    )
  }

  test("Checker.check: exponential") {
    val a = IChar('a')
    val b = IChar('b')
    val other1 = IChar('a').complement(false)
    val other2 = IChar.union(Seq(a, b)).complement(false)
    assertEquals(
      check("^(a|a)*$", ""),
      Success(Exponential(Witness(Seq((Seq(a), Seq(a))), Seq(other1))))
    )
    assertEquals(
      check("^((a)*)*$", ""),
      Success(Exponential(Witness(Seq((Seq(a), Seq(a))), Seq(other1))))
    )
    assertEquals(
      check("^(a|b|ab)*$", ""),
      Success(Exponential(Witness(Seq((Seq(a), Seq(b, a))), Seq(other2))))
    )
  }
}
