package codes.quine.labo.redos
import automaton.Complexity
import automaton.Witness
import data.IChar
import data.UString

class DiagnosticsSuite extends munit.FunSuite {
  test("Diagnostics#complexity") {
    assertEquals(Diagnostics.Safe(Some(Complexity.Constant)).complexity, Some(Complexity.Constant))
    assertEquals(Diagnostics.Safe(None).complexity, None)
    val w = Witness(Seq((Seq(IChar('a')), Seq(IChar('a')))), Seq(IChar('a')))
    assertEquals(
      Diagnostics.Vulnerable(UString.empty, Some(Complexity.Exponential(w))).complexity,
      Some(Complexity.Exponential(w))
    )
    assertEquals(Diagnostics.Vulnerable(UString.empty, None).complexity, None)
    assertEquals(Diagnostics.Unknown(Diagnostics.ErrorKind.Timeout).complexity, None)
  }

  test("Diagnostics.ErrorKind#toString") {
    assertEquals(Diagnostics.ErrorKind.Timeout.toString, "timeout")
    assertEquals(Diagnostics.ErrorKind.Unsupported("foo").toString, "unsupported (foo)")
    assertEquals(Diagnostics.ErrorKind.InvalidRegExp("foo").toString, "invalid RegExp (foo)")
  }
}
